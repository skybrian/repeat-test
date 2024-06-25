import {
  alwaysPickDefault,
  IntPicker,
  ParserInput,
  PickRequest,
  PickState,
} from "./picks.ts";

/**
 * Logs events during a playout.
 *
 * Picks can be grouped into *spans.* A span can contain zero or more picks. The
 * spans must nest to form a tree. A span's *level* is the number of spans are
 * still open when it's created.
 */
export interface PlayoutLogger {
  /**
   * Records the start of a span.
   * Returns the level of the new span.
   */
  startSpan(): number;

  /**
   * Cancels the last open span.
   * The picks since the last span start are discarded.
   * (The level is unchanged.)
   */
  cancelSpan(level?: number): void;

  /**
   * Ends a span.
   *
   * It optionally takes the level of the span to end.
   *
   * This should be the number returned by {@link begin}. (Otherwise an
   * exception will be thrown.)
   */
  endSpan(level?: number): void;

  /**
   * Called to indicate that the playout finished successfully.
   */
  finished(): void;
}

/**
 * A PlayoutLogger that just checks that it was called correctly.
 */
export class FakePlayoutLogger implements PlayoutLogger {
  level = 0;

  startSpan() {
    this.level++;
    return this.level;
  }

  cancelSpan() {
    if (this.level === 0) throw new Error("no open span");
    this.level--;
  }

  endSpan(levelToEnd?: number) {
    if (levelToEnd !== undefined && levelToEnd !== this.level) {
      throw new Error(
        `invalid span level. Want: ${this.level}, got: ${levelToEnd}`,
      );
    }
    this.level--;
  }

  finished(): void {
    if (this.level !== 0) throw new Error("unclosed span at end of playout");
  }
}

export type Playout = {
  /** The picks made to generate the value. */
  picks: number[];

  /**
   * The starting index of each span, in the order entered.
   */
  spanStarts: number[];

  /**
   * The ending index of each span, in the order entered.
   */
  spanEnds: number[];
};

export class PickLog {
  // Invariant: reqs.length == picks.length
  // (Parallel lists.)

  private readonly reqs: PickRequest[] = [];
  private readonly picks: number[] = [];

  get length() {
    return this.reqs.length;
  }

  getPicks(): number[] {
    return this.picks.slice();
  }

  getEntry(index: number) {
    return { req: this.reqs[index], pick: this.picks[index] };
  }

  pushPick(request: PickRequest, replay: number): void {
    this.reqs.push(request);
    this.picks.push(replay);
  }

  /**
   * Increments the last pick, wrapping around to the minimum value if needed.
   * Returns the new value.
   */
  rotateLastPick(): number {
    if (this.reqs.length === 0) {
      throw new Error("log is empty");
    }
    const req = this.reqs[this.reqs.length - 1];
    const pick = this.picks[this.picks.length - 1];
    const next = (pick === req.max) ? req.min : pick + 1;
    this.picks[this.picks.length - 1] = next;
    return next;
  }

  truncate(pickCount: number) {
    this.reqs.length = pickCount;
    this.picks.length = pickCount;
  }
}

export class SpanLog {
  // Invariant: spanStarts.length == spanEnds.length
  // (Parallel lists.)

  /** The offset when each span was started */
  private readonly spanStarts: number[] = [];

  /** The offset when each span ended. Set to NaN for incomplete spans. */
  private readonly spanEnds: number[] = [];

  /** The offset of each incomplete span, in the order created.  */
  private readonly openSpans: number[] = [];

  get level(): number {
    return this.openSpans.length;
  }

  /** Returns the recorded spans unless the playout stopped abruptly. */
  getSpans() {
    if (this.level > 0) return undefined;

    return {
      spanStarts: this.spanStarts.slice(),
      spanEnds: this.spanEnds.slice(),
    };
  }

  clear() {
    this.spanStarts.length = 0;
    this.spanEnds.length = 0;
    this.openSpans.length = 0;
  }

  startSpan(loc: number): void {
    const spanIndex = this.spanStarts.length;
    this.spanStarts.push(loc);
    this.spanEnds.push(NaN);
    this.openSpans.push(spanIndex);
  }

  /** Returns the index of the start of the span */
  removeLastSpan(): number {
    const spanIndex = this.openSpans.pop();
    if (spanIndex === undefined) {
      throw new Error("no open span");
    }
    const start = this.spanStarts[spanIndex];
    this.spanStarts.splice(spanIndex);
    this.spanEnds.splice(spanIndex);
    console.log(`removed span ${spanIndex}, start: ${start}`);
    return start;
  }

  endSpan(loc: number, level?: number): void {
    const spanIndex = this.openSpans.pop();
    if (spanIndex === undefined) {
      throw new Error("no open span");
    }
    if (level !== undefined && level !== this.openSpans.length + 1) {
      throw new Error(
        `invalid span level. Want: ${this.openSpans.length + 1}, got: ${level}`,
      );
    }
    this.spanEnds[spanIndex] = loc;
  }
}

/**
 * Records and replays picks made by underlying {@link IntPicker}.
 *
 * When recording, it pushes requests and responses on the stack.
 *
 * When replaying, it starts from the bottom of the stack and enforces that
 * requested ranges match. When it reaches the end of the stack, it starts
 * recording again.
 *
 * The stack can also be incremented like an odometer, which can be used for a
 * depth-first search of all possible replies to the recorded pick requests. See
 * {@link playNext}.
 */
export class PickStack {
  private readonly maxStackSize: number;

  private readonly log = new PickLog();
  private readonly spanLog = new SpanLog();

  /** The picks originally recorded. */
  private readonly recordedPicks: number[] = [];

  private playOffset = 0;

  /** Used to give proxy IntPickers a unique id. */
  private proxyCount = 0;

  /**
   * Constructs a new, empty log, ready for recording.
   * @param wrapped the picker to use when recording picks
   */
  constructor(
    private readonly wrapped: IntPicker,
    opts?: { maxLogSize?: number },
  ) {
    this.maxStackSize = opts?.maxLogSize ?? 1000;
  }

  /** The number of requests that have been recorded. */
  get length() {
    return this.log.length;
  }

  /**
   * Returns true if there are recorded picks that haven't been replayed.
   */
  get playing() {
    return this.playOffset < this.log.length;
  }

  /**
   * Clears the log and starts recording. Returns the picker to use.
   *
   * The picker's lifetime is until the next call to {@link record}, {@link play},
   * {@link playNext}, or {@link stopRecording}.
   */
  record(): IntPicker & PlayoutLogger {
    this.log.truncate(0);
    this.recordedPicks.length = 0;
    return this.play();
  }

  /**
   * Starts replaying the log, using a new picker. After reaching the end, it
   * will start recording again.
   *
   * The picker's lifetime is until the next call to {@link record}, {@link play},
   * {@link playNext}, or {@link stopRecording}.
   */
  play(): IntPicker & PlayoutLogger {
    this.playOffset = 0;
    this.spanLog.clear();

    this.proxyCount++;
    const id = this.proxyCount;

    const checkAlive = () => {
      if (id !== this.proxyCount) {
        throw new Error(
          "can't use this picker anymore, because record() or replay() were called",
        );
      }
    };

    const pick = (req: PickRequest): number => {
      checkAlive();

      if (this.playOffset < this.log.length) {
        // replaying
        const prev = this.log.getEntry(this.playOffset);
        if (prev.req.min !== req.min || prev.req.max !== req.max) {
          throw new Error(
            "when replaying, pick() must be called with the same request as before",
          );
        }
        this.playOffset++;
        return prev.pick;
      }

      // recording
      if (this.playOffset === this.maxStackSize) {
        throw new Error(
          `pick log is full (max size: ${this.maxStackSize})`,
        );
      }
      const pick = this.wrapped.pick(req);
      this.log.pushPick(req, pick);
      this.recordedPicks.push(pick);
      this.playOffset += 1;
      return pick;
    };

    const freeze = (): PickState => {
      checkAlive();
      return {
        start: () => new ParserInput(this.log.getPicks()),
      };
    };

    const startSpan = (): number => {
      checkAlive();
      this.spanLog.startSpan(this.playOffset);
      return this.spanLog.level;
    };

    const cancelSpan = (level?: number) => {
      checkAlive();
      if (this.playOffset < this.log.length) {
        throw new Error("can't retry span when replaying");
      }
      if (level !== undefined && level !== this.spanLog.level) {
        throw new Error(
          `invalid span level. Want: ${this.spanLog.level}, got: ${level}`,
        );
      }

      const start = this.spanLog.removeLastSpan();
      this.log.truncate(start);
      this.recordedPicks.splice(start);
    };

    const endSpan = (level?: number) => {
      checkAlive();
      this.spanLog.endSpan(this.playOffset, level);
    };

    const finished = () => {
      checkAlive();
    };

    return { pick, freeze, startSpan, cancelSpan, endSpan, finished };
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
    this.spanLog.clear();

    while (this.log.length > 0) {
      const pick = this.log.rotateLastPick();
      if (pick !== this.recordedPicks[this.log.length - 1]) {
        return this.play();
      }

      // We exhausted all possibilties for the last pick request.
      this.log.truncate(this.log.length - 1);
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
  stopRecording(): Playout | undefined {
    if (this.playing) throw new Error("not recording");
    this.proxyCount++; // invalidate current proxy
    const picks = this.log.getPicks();
    const spans = this.spanLog.getSpans();
    if (!spans) return undefined;
    return { picks, ...spans };
  }
}

export type NestedPicks = (number | NestedPicks)[];

export class Solution<T> {
  constructor(readonly val: T, private readonly playout: Playout) {}

  get picks() {
    return this.playout.picks;
  }

  getNestedPicks(): NestedPicks {
    const { picks, spanStarts, spanEnds } = this.playout;

    const root: NestedPicks = [];
    let current = root;
    const resultStack = [];
    const spanEndStack: number[] = [];

    let spanAt = 0;
    for (let i = 0; i <= picks.length; i++) {
      while (spanAt < spanStarts.length && spanStarts[spanAt] === i) {
        // start a new list
        const nextList: NestedPicks = [];
        current.push(nextList);
        resultStack.push(current);
        current = nextList;

        // remember where to stop
        spanEndStack.push(spanEnds[spanAt]);
        spanAt++;
      }

      while (
        spanEndStack.length > 0 && spanEndStack[spanEndStack.length - 1] === i
      ) {
        // end the current list
        current = resultStack.pop() as NestedPicks;
        spanEndStack.pop();
      }

      if (i < picks.length) {
        current.push(picks[i]);
      }
    }
    if (spanEndStack.length > 0) {
      throw new Error("unbalanced spanStarts and spanEnds");
    }
    return root;
  }
}

/**
 * Indicates a failed attempt to generate a value.
 */
export const NOT_FOUND = Symbol("not found");

/**
 * Walks a search tree and returns whatever is found at a leaf.
 *
 * Each leaf holds either a value or nothing (a dead end).
 */
export type WalkFunction<T> = (
  picker: IntPicker,
  log: PlayoutLogger,
) => T | typeof NOT_FOUND;

/**
 * Visits every leaf in a search tree in order, depth-first. Starts by taking
 * all default choices.
 */
export function* walkAllPaths<T>(
  walk: WalkFunction<T>,
): Generator<Solution<T>> {
  const stack = new PickStack(alwaysPickDefault);
  let next: IntPicker & PlayoutLogger | null = stack.record();
  while (next !== null) {
    const val = walk(next, next);
    if (stack.playing) {
      throw "didn't read every value";
    }
    if (val !== NOT_FOUND) {
      // reached a solution
      const playout = stack.stopRecording();
      if (playout === undefined) {
        throw new Error("didn't close every span");
      }
      yield new Solution(val, playout);
    }
    next = stack.playNext();
  }
}
