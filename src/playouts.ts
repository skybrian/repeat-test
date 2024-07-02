import {
  DepthFirstPicker,
  IntPicker,
  PickRequest,
  RetryPicker,
} from "./picks.ts";

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

/**
 * Indicates that the current playout won't result in picking a value.
 */
export class PlayoutFailed extends Error {
  constructor(msg: string) {
    super(msg);
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
 * The methods available when running a playout.
 *
 * Spans must nest to form a tree. Spans with less than two picks aren't
 * normally recorded. A span's *level* is the number of spans are still open
 * when it's created.
 */
export type PlayoutContext = IntPicker & {
  /**
   * Records the start of a span.
   * Returns the level of the new span.
   */
  startSpan(): number;

  /**
   * Cancels the last open span.
   * The picks since the last span start are discarded.
   * (The level is unchanged.)
   *
   * Returns true if there is another playout available.
   */
  cancelSpan(level?: number): boolean;

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

  /**
   * Ends playout generation and returns the playout.
   */
  toPlayout(): Playout;
};

/**
 * Logs a single playout.
 */
export class PlayoutLog implements PlayoutContext {
  // Invariant: starts.length == ends.length
  // (Parallel lists.)

  /** The offset when each span was started */
  private readonly starts: number[] = [];

  /** The offset when each span ended. Set to NaN for incomplete spans. */
  private readonly ends: number[] = [];

  /** The offset of each incomplete span, in the order created.  */
  private readonly openSpans: number[] = [];

  constructor(private readonly picker: RetryPicker) {}

  get level(): number {
    return this.openSpans.length;
  }

  pick(request: PickRequest): number {
    return this.picker.pick(request);
  }

  startSpan(): number {
    const spanIndex = this.starts.length;
    this.starts.push(this.picker.depth);
    this.ends.push(NaN);
    this.openSpans.push(spanIndex);
    return this.level;
  }

  /** Returns the index of the start of the span */
  cancelSpan(level: number): boolean {
    if (level !== this.level) {
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

    return this.picker.backTo(start);
  }

  endSpan(opts?: EndSpanOptions): void {
    const end = this.picker.depth;
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
    if (this.picker.replaying) {
      throw new Error("playout didn't read every pick");
    }
    if (this.level !== 0) {
      throw new Error("unclosed span at end of playout");
    }
  }

  toPlayout() {
    this.endPlayout();
    const starts = this.starts.slice();
    const ends = this.ends.slice();
    return new Playout(this.picker.getPicks(), starts, ends);
  }
}

/**
 * Iterates over unvisited leaves in a search tree, by doing picks.
 *
 * The search tree is defined by calls to {@link PlayoutContext.pick}. For
 * example, the argument to the first pick() call on the first iteration defines
 * the root, and the return value (chosen using the child picker) determines
 * which child to visit first.
 *
 * On subsequent iterations, the first pick call (for the root) must have the
 * same range as the previous iteration (since the root has already been
 * defined). If not, pick() will throw an exception. Similarly for all
 * subsequent picks up to an unexplored part of the tree.
 *
 * This is typically done using a deterministic function that makes all choices
 * based on the output of previous pick() calls.
 *
 * The sequence stops when there are no unexplored parts of the tree to be
 * reached by backtracking.
 *
 * @param childPicker picks the first child to visit when a new node is added to
 * the search tree.
 */
export function* everyPlayout(
  firstChildPicker: IntPicker,
): IterableIterator<PlayoutContext> {
  const picker = new DepthFirstPicker({ firstChildPicker, maxDepth: 100 });
  while (true) {
    yield new PlayoutLog(picker);
    if (!picker.backTo(0)) {
      return;
    }
  }
}

/**
 * A picker that provides a single playout.
 */
export class StrictPicker implements RetryPicker {
  offset = 0;

  constructor(private readonly picks: number[]) {}

  get depth() {
    return this.offset;
  }

  getPicks(): number[] {
    return this.picks.slice();
  }

  get replaying(): boolean {
    return this.offset < this.picks.length;
  }

  backTo(_depth: number): boolean {
    return false;
  }

  pick(req: PickRequest): number {
    if (this.offset >= this.picks.length) {
      this.offset++;
      return req.default;
    }
    const pick = this.picks[this.offset++];
    if (!req.inRange(pick)) {
      throw new PlayoutFailed(
        `Pick ${this.offset - 1} (${pick}) is out of range for ${req}`,
      );
    }
    return pick;
  }

  get parsed(): boolean {
    return this.offset === this.picks.length;
  }
}
