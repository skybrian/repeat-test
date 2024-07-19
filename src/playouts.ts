import { PickList } from "./picks.ts";
import { RetryPicker } from "./backtracking.ts";

export type NestedPicks = (number | NestedPicks)[];

export type SpanList = {
  starts: number[];
  ends: number[];
};

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
  readonly picks: PickList;
  readonly spans: SpanList;

  /**
   * Constructs a Playout from logged picks and spans.
   *
   * @param replies The picks made to generate the value.
   * @param opts.start The starting index of each span, in the order entered.
   * @param opts.end The ending index of each span, in the order entered.
   *
   * (Note that zero-length spans are ambigous in this representation.)
   */
  constructor(
    picks: PickList,
    spans?: SpanList,
  ) {
    this.picks = picks;
    this.spans = spans ?? { starts: [], ends: [] };
    if (this.spans.starts.length !== this.spans.ends.length) {
      throw new Error("span starts and ends must have the same length");
    }
  }

  toNestedPicks(): NestedPicks {
    const { replies } = this.picks;
    const { starts, ends } = this.spans;

    const root: NestedPicks = [];
    let current = root;
    const resultStack: NestedPicks[] = [];
    const spanEndStack: number[] = [];

    function startSpans(i: number) {
      while (spanAt < starts.length && starts[spanAt] === i) {
        // start a new list
        const nextList: NestedPicks = [];
        current.push(nextList);
        resultStack.push(current);
        current = nextList;

        // remember where to stop
        spanEndStack.push(ends[spanAt]);
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
    for (let i = 0; i <= replies.length; i++) {
      endSpans(i);
      startSpans(i);
      if (i < replies.length) {
        current.push(replies[i]);
      }
    }
    if (spanEndStack.length > 0) {
      throw new Error("unbalanced spanStarts and spanEnds");
    }
    return root;
  }
}

/**
 * The methods available when running a playout.
 *
 * Spans must nest to form a tree. Spans with less than two picks aren't
 * normally recorded. A span's *level* is the number of spans are still open
 * when it's created.
 */
export class PlayoutContext {
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

  /**
   * Records the start of a span.
   *
   * Returns the level of the new span.
   */
  startSpan(): number {
    const spanIndex = this.starts.length;
    this.starts.push(this.picker.depth);
    this.ends.push(NaN);
    this.openSpans.push(spanIndex);
    return this.level;
  }

  /**
   * Cancels the last open span.
   *
   * The picks since the last span start are discarded.
   * (The level is unchanged.)
   *
   * Returns true if there is another playout available.
   */
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

  /**
   * Ends a span.
   *
   * To check for unbalanced start and end calls, it optionally takes the level
   * of the span to end. This should be the number returned by
   * {@link startSpan}. (Otherwise an exception will be thrown.)
   */
  endSpan(level: number): void {
    const end = this.picker.depth;
    const spanIndex = this.openSpans.pop();
    if (spanIndex === undefined) {
      throw new Error("no open span");
    }
    if (level !== this.openSpans.length + 1) {
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

  /**
   * Ends playout generation and returns the playout.
   */
  toPlayout() {
    if (this.level !== 0) {
      throw new Error("unclosed span at end of playout");
    }
    const picks = this.picker.getPicks();
    const starts = this.starts.slice();
    const ends = this.ends.slice();
    return new Playout(picks, { starts, ends });
  }
}
