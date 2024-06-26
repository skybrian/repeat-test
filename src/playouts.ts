import { PickRequest } from "./picks.ts";

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
