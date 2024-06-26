import { alwaysPickDefault, IntPicker, PickRequest } from "./picks.ts";
import {
  PickLog,
  Playout,
  PlayoutLogger,
  Solution,
  SpanLog,
} from "./playouts.ts";

/**
 * Records and replays the picks made during a playout.
 *
 * When replaying, it starts by playing back the picks in the buffer, then
 * switches to recording mode.
 *
 * The buffered playout can also be incremented like an odometer, which can be
 * used for a depth-first search of all possible playouts. See {@link playNext}.
 */
export class PlayoutBuffer {
  private readonly maxSize: number;

  // Invariant: recordedPicks.length === picks.length.

  /** The picks that were originally recorded, as sent by the pick source. */
  private readonly recordedPicks: number[] = [];

  /** The picks to play back. (Possibly modified since they were recorded.) */
  private readonly picks = new PickLog();

  /** The spans recorded during the current or most-recent playout. */
  private readonly spans = new SpanLog();

  private playOffset = 0;

  /** Used to give proxy IntPickers a unique id. */
  private proxyCount = 0;

  /**
   * Constructs a new, empty log, ready for recording.
   *
   * @param source provides the picks when recording.
   */
  constructor(
    private readonly source: IntPicker,
    opts?: { maxLogSize?: number },
  ) {
    this.maxSize = opts?.maxLogSize ?? 1000;
  }

  /** The number of picks that have been recorded. */
  get length() {
    return this.picks.length;
  }

  /** Returns true if there are picks that haven't been replayed. */
  get playing() {
    return this.playOffset < this.picks.length;
  }

  /**
   * Clears the log and starts recording. Returns the picker to use.
   *
   * The picker's lifetime is until the next call to {@link record}, {@link play},
   * {@link playNext}, or {@link finishPlayout}.
   */
  record(): IntPicker & PlayoutLogger {
    this.picks.truncate(0);
    this.recordedPicks.length = 0;
    return this.play();
  }

  /**
   * Starts replaying the log, using a new picker. After reaching the end, it
   * will start recording again.
   *
   * The picker's lifetime is until the next call to {@link record}, {@link play},
   * {@link playNext}, or {@link finishPlayout}.
   */
  play(): IntPicker & PlayoutLogger {
    this.playOffset = 0;
    this.spans.clear();

    this.proxyCount++;
    const id = this.proxyCount;

    const checkAlive = () => {
      if (id !== this.proxyCount) {
        throw new Error("can't use this picker because the playout is over");
      }
    };

    const pick = (req: PickRequest): number => {
      checkAlive();

      if (this.playOffset < this.picks.length) {
        // replaying
        const prev = this.picks.getEntry(this.playOffset);
        if (prev.req.min !== req.min || prev.req.max !== req.max) {
          throw new Error(
            "when replaying, pick() must be called with the same request as before",
          );
        }
        this.playOffset++;
        return prev.pick;
      }

      // recording
      if (this.playOffset === this.maxSize) {
        throw new Error(
          `playout buffer is full (max size: ${this.maxSize})`,
        );
      }
      const pick = this.source.pick(req);
      this.picks.pushPick(req, pick);
      this.recordedPicks.push(pick);
      this.playOffset += 1;
      return pick;
    };

    const startSpan = (): number => {
      checkAlive();
      this.spans.startSpan(this.playOffset);
      return this.spans.level;
    };

    const cancelSpan = (level?: number) => {
      checkAlive();
      if (this.playOffset < this.picks.length) {
        throw new Error("can't cancel a span while replaying");
      }
      if (level !== undefined && level !== this.spans.level) {
        throw new Error(
          `invalid span level. Want: ${this.spans.level}, got: ${level}`,
        );
      }

      const start = this.spans.removeLastSpan();
      this.picks.truncate(start);
      this.recordedPicks.splice(start);
    };

    const endSpan = (level?: number) => {
      checkAlive();
      this.spans.endSpan(this.playOffset, level);
    };

    const finished = () => {
      checkAlive();
      this.proxyCount++; // invalidate this object
    };

    return { pick, startSpan, cancelSpan, endSpan, finished };
  }

  /**
   * Starts a replay using a new combination of picks. Returns null when all
   * combinations have been tried.
   *
   * It increments the top pick on the stack, wrapping around to the minimum
   * value if needed. If all picks have been used, it pops the stack and tries
   * again.
   */
  playNext(): IntPicker & PlayoutLogger | null {
    this.playOffset = 0;
    this.spans.clear();

    while (this.picks.length > 0) {
      const pick = this.picks.rotateLastPick();
      if (pick !== this.recordedPicks[this.picks.length - 1]) {
        return this.play();
      }

      // We exhausted all possibilties for the last pick request.
      this.picks.truncate(this.picks.length - 1);
      this.recordedPicks.pop();
    }

    // We exhausted all pick requests on the stack.
    return null;
  }

  /**
   * Stops recording and returns the playout if it finished.
   *
   * Invalidates the current picker, so no more picks can be recorded. Returns
   * undefined if the playout ended abruptly (there are open spans).
   */
  finishPlayout(): Playout | undefined {
    if (this.playing) throw new Error("not recording");
    this.proxyCount++; // invalidate current proxy
    const picks = this.picks.getPicks();
    const spans = this.spans.getSpans();
    if (!spans) return undefined;
    return { picks, ...spans };
  }
}

/**
 * Thrown to indicate that a playout didn't find a solution.
 */
export class PlayoutFailed extends Error {
  constructor(msg: string) {
    super(msg);
  }
}

/**
 * Walks a search tree and returns whatever is found at a leaf.
 *
 * Each leaf holds either a value or nothing (a dead end).
 */
export type PlayoutFunction<T> = (
  picker: IntPicker,
  log: PlayoutLogger,
) => T;

/**
 * Visits every leaf in a search tree in order, depth-first. Starts with all
 * default picks.
 */
export function* generateAllSolutions<T>(
  runPlayout: PlayoutFunction<T>,
): Generator<Solution<T>> {
  const buffer = new PlayoutBuffer(alwaysPickDefault);
  let next: IntPicker & PlayoutLogger | null = buffer.record();
  while (next !== null) {
    try {
      const val = runPlayout(next, next);
      if (buffer.playing) {
        throw new Error("playout didn't read every value");
      }
      // reached a solution
      const playout = buffer.finishPlayout();
      if (playout === undefined) {
        throw new Error("playout didn't close every span");
      }
      yield new Solution(val, playout);
    } catch (e) {
      if (!(e instanceof PlayoutFailed)) {
        throw e;
      }
      // backtracked from a dead end; try the next path
    }
    next = buffer.playNext();
  }
}
