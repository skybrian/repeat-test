import { IntPicker, PickRequest } from "./picks.ts";

export type NestedPicks = (number | NestedPicks)[];

/**
 * A log of choices made while generating a value using an {@link IntPicker}.
 *
 * Picks are grouped into *spans.* Picks within the same span represent a
 * subtree in the process used to generate a value.
 *
 * To avoid clutter, {@link PlayoutBuffer} only records spans with two or more
 * picks. So, constant subtrees are not represented in the Playout, and any
 * value that was generated based on a single integer pick is represented as a
 * single number.
 */
export class Playout {
  /**
   * Constructs a Playout from logged picks and spans.
   *
   * @param picks The picks made to generate the value.
   * @param spanStarts The starting index of each span, in the order entered.
   * @param spanEnds The ending index of each span, in the order entered.
   *
   * (Note that zero-length spans are ambigous in this representation.)
   */
  constructor(
    readonly picks: number[],
    readonly spanStarts: number[],
    readonly spanEnds: number[],
  ) {
    if (spanStarts.length !== spanEnds.length) {
      throw new Error("spanStarts and spanEnds must have the same length");
    }
  }

  toNestedPicks(): NestedPicks {
    const { picks, spanStarts, spanEnds } = this;

    const root: NestedPicks = [];
    let current = root;
    const resultStack: NestedPicks[] = [];
    const spanEndStack: number[] = [];

    function startSpans(i: number) {
      while (spanAt < spanStarts.length && spanStarts[spanAt] === i) {
        // start a new list
        const nextList: NestedPicks = [];
        current.push(nextList);
        resultStack.push(current);
        current = nextList;

        // remember where to stop
        spanEndStack.push(spanEnds[spanAt]);
        spanAt++;
        endSpans(i); // might have just started an empty span
      }
    }

    function endSpans(i: number) {
      while (
        spanEndStack.length > 0 && spanEndStack[spanEndStack.length - 1] === i
      ) {
        // end the current list
        current = resultStack.pop() as NestedPicks;
        spanEndStack.pop();
      }
    }

    let spanAt = 0;
    for (let i = 0; i <= picks.length; i++) {
      endSpans(i);
      startSpans(i);
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

export type EndSpanOptions = {
  /**
   * The level of the span to end. This should be the number returned by
   * {@link PlayoutWriter.startSpan}. (Otherwise an exception will be thrown.)
   *
   * If not set, the level of the last span is used.
   */
  level?: number;
};

/**
 * Logs events during a playout.
 *
 * Spans must nest to form a tree. Spans with less than two picks aren't
 * normally recorded. A span's *level* is the number of spans are still open
 * when it's created.
 */
export interface PlayoutWriter {
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
   * To check for unbalanced start and end calls, it optionally takes the level
   * of the span to end. This should be the number returned by
   * {@link startSpan}. (Otherwise an exception will be thrown.)
   */
  endSpan(opts?: EndSpanOptions): void;

  /**
   * Called to indicate that the playout finished successfully.
   */
  finished(): void;
}

/**
 * A {@link PlayoutWriter} that doesn't record anything.
 *
 * It just checks that it was called correctly.
 */
export class NullPlayoutWriter implements PlayoutWriter {
  private level = 0;

  startSpan() {
    this.level++;
    return this.level;
  }

  cancelSpan() {
    if (this.level === 0) throw new Error("no open span");
    this.level--;
  }

  endSpan(opts?: EndSpanOptions) {
    const levelToEnd = opts?.level;
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

class PickLog {
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

  truncate(pickCount: number) {
    this.reqs.length = pickCount;
    this.picks.length = pickCount;
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
}

export class PlayoutLog {
  private readonly picks = new PickLog();

  readonly maxSize: number;

  // Invariant: starts.length == ends.length
  // (Parallel lists.)

  /** The offset when each span was started */
  private readonly starts: number[] = [];

  /** The offset when each span ended. Set to NaN for incomplete spans. */
  private readonly ends: number[] = [];

  /** The offset of each incomplete span, in the order created.  */
  private readonly openSpans: number[] = [];

  private playOffset = 0;

  constructor(opts?: { maxSize?: number }) {
    this.maxSize = opts?.maxSize || 1000;
  }

  get length() {
    return this.picks.length;
  }

  get atEnd(): boolean {
    return this.playOffset === this.picks.length;
  }

  get level(): number {
    return this.openSpans.length;
  }

  nextPick() {
    if (this.atEnd) {
      throw new Error("no more picks");
    }
    return this.picks.getEntry(this.playOffset++);
  }

  clear() {
    this.picks.truncate(0);
    this.rewind();
  }

  rewind(): void {
    this.starts.length = 0;
    this.ends.length = 0;
    this.openSpans.length = 0;
    this.playOffset = 0;
  }

  pushPick(request: PickRequest, replay: number): void {
    if (!this.atEnd) {
      throw new Error("can't push a pick when not at the end of the log");
    }
    if (this.length >= this.maxSize) {
      throw new Error("pick log is full");
    }
    this.picks.pushPick(request, replay);
    this.playOffset++;
  }

  rotateLastPick(): number {
    this.rewind();
    return this.picks.rotateLastPick();
  }

  popPick() {
    if (this.length === 0) {
      throw new Error("log is empty");
    }
    this.rewind();
    this.picks.truncate(this.picks.length - 1);
  }

  startSpan(): void {
    const spanIndex = this.starts.length;
    this.starts.push(this.playOffset);
    this.ends.push(NaN);
    this.openSpans.push(spanIndex);
  }

  /** Returns the index of the start of the span */
  removeLastSpan(): number {
    if (this.playOffset !== this.length) {
      throw new Error("can only remove a span from the end of a pick log");
    }
    const idx = this.openSpans.pop();
    if (idx === undefined) {
      throw new Error("no open span");
    }
    const start = this.starts[idx];
    this.starts.splice(idx);
    this.ends.splice(idx);
    this.picks.truncate(start);
    this.playOffset = this.length;
    return start;
  }

  endSpan(opts?: EndSpanOptions): void {
    const end = this.playOffset;
    const spanIndex = this.openSpans.pop();
    if (spanIndex === undefined) {
      throw new Error("no open span");
    }
    const level = opts?.level;
    if (level !== undefined && level !== this.openSpans.length + 1) {
      throw new Error(
        `invalid span level. Want: ${this.openSpans.length + 1}, got: ${level}`,
      );
    }
    const start = this.starts[spanIndex];
    const size = end - start;
    const firstChild = spanIndex + 1;
    if (
      size < 2 ||
      (firstChild < this.starts.length && start === this.starts[firstChild] &&
        end === this.ends[firstChild])
    ) {
      // don't record this span
      this.starts.splice(spanIndex, 1);
      this.ends.splice(spanIndex, 1);
      return;
    }
    this.ends[spanIndex] = end;
  }

  toPlayout() {
    if (this.level > 0) throw new Error("playout didn't close every span");
    const picks = this.picks.getPicks();
    const starts = this.starts.slice();
    const ends = this.ends.slice();
    return new Playout(picks, starts, ends);
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
  // Invariant: recordedPicks.length === log.length.

  /** The picks that were originally recorded, as sent by the pick source. */
  private readonly recordedPicks: number[] = [];

  /** The picks and spans recorded during the current or most-recent playout. */
  private readonly log: PlayoutLog;

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
    const maxSize = opts?.maxLogSize ?? 1000;
    this.log = new PlayoutLog({ maxSize });
  }

  /** The number of picks that have been recorded. */
  get length() {
    return this.log.length;
  }

  /** Returns true if there are picks that haven't been replayed. */
  get playing() {
    return !this.log.atEnd;
  }

  /**
   * Clears the log and starts recording. Returns the picker to use.
   *
   * The picker's lifetime is until the next call to {@link record}, {@link play},
   * {@link playNext}, or {@link finishPlayout}.
   */
  record(): IntPicker & PlayoutWriter {
    this.log.clear();
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
  play(): IntPicker & PlayoutWriter {
    this.log.rewind();

    this.proxyCount++;
    const id = this.proxyCount;

    const checkAlive = () => {
      if (id !== this.proxyCount) {
        throw new Error("can't use this picker because the playout is over");
      }
    };

    const pick = (req: PickRequest): number => {
      checkAlive();

      if (!this.log.atEnd) {
        // replaying
        const prev = this.log.nextPick();
        if (prev.req.min !== req.min || prev.req.max !== req.max) {
          throw new Error(
            "when replaying, pick() must be called with the same request as before",
          );
        }
        return prev.pick;
      }

      // recording
      const pick = this.source.pick(req);
      this.log.pushPick(req, pick);
      this.recordedPicks.push(pick);
      return pick;
    };

    const startSpan = (): number => {
      checkAlive();
      this.log.startSpan();
      return this.log.level;
    };

    const cancelSpan = (level?: number) => {
      checkAlive();
      if (level !== undefined && level !== this.log.level) {
        throw new Error(
          `invalid span level. Want: ${this.log.level}, got: ${level}`,
        );
      }
      const start = this.log.removeLastSpan();
      this.recordedPicks.splice(start);
    };

    const endSpan = (opts?: EndSpanOptions) => {
      checkAlive();
      this.log.endSpan(opts);
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
  playNext(): IntPicker & PlayoutWriter | null {
    this.log.rewind();

    while (this.log.length > 0) {
      const pick = this.log.rotateLastPick();
      if (pick !== this.recordedPicks[this.log.length - 1]) {
        return this.play();
      }

      // We exhausted all possibilties for the last pick request.
      this.log.popPick();
      this.recordedPicks.pop();
    }

    // We exhausted all pick requests on the stack.
    return null;
  }

  /**
   * Stops recording and returns the playout.
   *
   * Invalidates the current picker, so no more picks can be recorded.
   */
  finishPlayout(): Playout {
    if (this.playing) throw new Error("not recording");
    this.proxyCount++; // invalidate current proxy
    return this.log.toPlayout();
  }
}
