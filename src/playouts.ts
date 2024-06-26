import { IntPicker, PickRequest } from "./picks.ts";

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
    if (this.level !== 0) {
      throw new Error("unclosed span at end of playout");
    }
  }
}

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
  // Invariant: starts.length == ends.length
  // (Parallel lists.)

  /** The offset when each span was started */
  private readonly starts: number[] = [];

  /** The offset when each span ended. Set to NaN for incomplete spans. */
  private readonly ends: number[] = [];

  /** The offset of each incomplete span, in the order created.  */
  private readonly openSpans: number[] = [];

  get level(): number {
    return this.openSpans.length;
  }

  /** Returns the recorded spans unless the playout stopped abruptly. */
  getSpans() {
    if (this.level > 0) return undefined;

    return {
      starts: this.starts.slice(),
      ends: this.ends.slice(),
    };
  }

  clear() {
    this.starts.length = 0;
    this.ends.length = 0;
    this.openSpans.length = 0;
  }

  startSpan(loc: number): void {
    const spanIndex = this.starts.length;
    this.starts.push(loc);
    this.ends.push(NaN);
    this.openSpans.push(spanIndex);
  }

  /** Returns the index of the start of the span */
  removeLastSpan(): number {
    const idx = this.openSpans.pop();
    if (idx === undefined) {
      throw new Error("no open span");
    }
    const start = this.starts[idx];
    this.starts.splice(idx);
    this.ends.splice(idx);
    console.log(`removed span ${idx}, start: ${start}`);
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
    this.ends[spanIndex] = loc;
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

export class StrictPicker implements IntPicker {
  offset = 0;

  constructor(private readonly picks: number[]) {}

  pick(req: PickRequest): number {
    if (this.offset >= this.picks.length) {
      throw new PlayoutFailed("ran out of picks");
    }
    const pick = this.picks[this.offset++];
    if (!req.inRange(pick)) {
      throw new PlayoutFailed(
        `Pick ${this.offset - 1} (${pick}) is out of range for ${req}`,
      );
    }
    return pick;
  }

  get finished(): boolean {
    return this.offset === this.picks.length;
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
    const { starts, ends } = spans;
    return { picks, spanStarts: starts, spanEnds: ends };
  }
}
