import { RetryPicker } from "./backtracking.ts";

export type SpanList = {
  starts: number[];
  ends: number[];
};

export type NestedPicks = (number | NestedPicks)[];

export function nestedPicks(replies: number[], spans: SpanList): NestedPicks {
  const { starts, ends } = spans;

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

/**
 * Provides methods to record spans of picks.
 *
 * This log can be used along with a {@link RetryPicker} to record spans within
 * which picks were requested. The starts and ends of spans are recorded based
 * on how many picks were recorded. The {@link cancelSpan} method must be called
 * instead of {@link RetryPicker.backTo}.
 *
 * Spans must nest to form a tree. Spans with less than two picks aren't
 * recorded. A span's *level* is the number of spans are still open when it's
 * created.
 */
export class SpanLog {
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

  getSpans(): SpanList {
    return { starts: this.starts, ends: this.ends };
  }
}
