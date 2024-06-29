import { everyPath, IntPicker, PickPath, PickRequest } from "./picks.ts";

export type NestedPicks = (number | NestedPicks)[];

/**
 * A log of choices made while generating a value using an {@link IntPicker}.
 *
 * Picks are grouped into *spans.* Picks within the same span represent a
 * subtree in the process used to generate a value.
 *
 * To avoid clutter, {@link PlayoutRecorder} only records spans with two or more
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
  endPlayout(): void;
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

  endPlayout(): void {
    if (this.level !== 0) {
      throw new Error("unclosed span at end of playout");
    }
  }
}

/**
 * Logs a single playout.
 */
export class PlayoutLog implements PlayoutWriter {
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

  constructor(private readonly path: PickPath, opts?: { maxSize?: number }) {
    this.maxSize = opts?.maxSize || 1000;
  }

  /** The number of picks that have been recorded. */
  get length() {
    return this.path.depth;
  }

  get atEnd(): boolean {
    return this.playOffset === this.path.depth;
  }

  get level(): number {
    return this.openSpans.length;
  }

  nextPick() {
    if (this.atEnd) {
      throw new Error("no more picks");
    }
    return this.path.entryAt(this.playOffset++);
  }

  pushPick(request: PickRequest, replay: number): void {
    if (!this.atEnd) {
      throw new Error("can't push a pick when not at the end of the log");
    }
    if (this.length >= this.maxSize) {
      throw new Error("pick log is full");
    }
    this.path.addChild(request, replay);
    this.playOffset++;
  }

  startSpan(): number {
    const spanIndex = this.starts.length;
    this.starts.push(this.playOffset);
    this.ends.push(NaN);
    this.openSpans.push(spanIndex);
    return this.level;
  }

  /** Returns the index of the start of the span */
  cancelSpan(level?: number): number {
    if (this.playOffset !== this.length) {
      throw new Error("can only remove a span from the end of a pick log");
    }
    if (level !== undefined && level !== this.level) {
      throw new Error(
        `invalid span level. Want: ${this.level}, got: ${level}`,
      );
    }
    const idx = this.openSpans.pop();
    if (idx === undefined) {
      throw new Error("no open span");
    }
    const start = this.starts[idx];
    this.starts.splice(idx);
    this.ends.splice(idx);
    this.path.truncate(start);
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

  endPlayout(): void {
    if (this.level !== 0) {
      throw new Error("unclosed span at end of playout");
    }
  }

  toPlayout() {
    if (this.level > 0) throw new Error("playout didn't close every span");
    const starts = this.starts.slice();
    const ends = this.ends.slice();
    return new Playout(this.path.replies, starts, ends);
  }
}

/**
 * The methods available when running a playout.
 */
export type PlayoutContext = IntPicker & PlayoutWriter & {
  /**
   * Ends playout generation and returns the playout.
   */
  getPlayout(): Playout;
};

/**
 * Records and replays the picks made during a single playout.
 *
 * When replaying, it starts by playing back the picks in the buffer, then
 * switches to recording mode.
 */
class PlayoutRecorder {
  readonly log: PlayoutLog;

  /**
   * Constructs a new, empty log, ready for recording.
   *
   * @param source provides the picks when recording.
   */
  constructor(
    private readonly path: PickPath,
    private readonly source: IntPicker,
    opts?: { maxLogSize?: number },
  ) {
    const maxSize = opts?.maxLogSize ?? 1000;
    this.log = new PlayoutLog(this.path, { maxSize });
  }

  /**
   * Returns a context to use for a new playout.
   *
   * It will replay any previously recorded picks, and then take picks from the
   * source provided in the constructor.
   */
  startPlayout(): PlayoutContext {
    const pick = (req: PickRequest): number => {
      if (!this.log.atEnd) {
        // replaying
        const prev = this.log.nextPick();
        if (prev.req.min !== req.min || prev.req.max !== req.max) {
          throw new Error(
            "when replaying, pick() must be called with the same request as before",
          );
        }
        return prev.reply;
      }

      // recording
      const pick = this.source.pick(req);
      this.log.pushPick(req, pick);
      return pick;
    };

    const startSpan = (): number => {
      return this.log.startSpan();
    };

    const cancelSpan = (level?: number) => {
      this.log.cancelSpan(level);
    };

    const endSpan = (opts?: EndSpanOptions) => {
      this.log.endSpan(opts);
    };

    const endPlayout = () => {
      this.endPlayout();
    };

    const getPlayout = () => {
      return this.endPlayout();
    };

    return { pick, startSpan, cancelSpan, endSpan, endPlayout, getPlayout };
  }

  /**
   * Stops recording and returns the playout.
   *
   * Invalidates the current picker, so no more picks can be recorded.
   */
  endPlayout(): Playout {
    if (!this.log.atEnd) throw new Error("playout didn't read every pick");
    this.log.endPlayout();
    return this.log.toPlayout();
  }
}

/**
 * A generator that returns a different sequence of picks each time.
 *
 * The sequence stops when all possible paths are exhausted. Uses a depth-first
 * search.
 *
 * This assumes that the PickRequests are made by a deterministic function, so
 * that if the pick() method returns the same picks, the function will take the
 * same path.
 *
 * @picker used to generate the picks through any unexplored subtree.
 */
export function* everyPlayout(
  picker: IntPicker,
): IterableIterator<PlayoutContext> {
  for (const path of everyPath()) {
    const recorder = new PlayoutRecorder(path, picker);
    yield recorder.startPlayout();
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
