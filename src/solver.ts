import {
  alwaysPickDefault,
  IntPicker,
  ParserInput,
  PickRequest,
  PickState,
} from "./picks.ts";

/**
 * A picker that also groups picks into spans.
 *
 * A span contains zero or more picks. The spans must nest to form a tree. A
 * span's *level* is the number of spans are still open when it's created.
 */
export interface SpanPicker extends IntPicker {
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
}

/**
 * Runs a function that requires a SpanPicker, wihtout saving the spans.
 */
export function runWithPicks<T>(
  input: IntPicker,
  run: (s: SpanPicker) => T,
): T {
  let level = 0;
  const picker = {
    pick: input.pick.bind(input),
    freeze: input.freeze.bind(input),
    startSpan: () => {
      level++;
      return level;
    },
    cancelSpan: () => {
      if (level === 0) throw new Error("no open span");
      level--;
    },
    endSpan: (levelToEnd?: number) => {
      if (levelToEnd !== undefined && levelToEnd !== level) {
        throw new Error(
          `invalid span level. Want: ${level}, got: ${levelToEnd}`,
        );
      }
      level--;
    },
  };
  const result = run(picker);
  if (level !== 0) throw new Error("unclosed span");
  return result;
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

  // Invariant: spanStarts.length == spanEnds.length
  // (Parallel lists.)

  /** The offset when each span was started */
  private readonly spanStarts: number[] = [];

  /** The offset when each span ended. Set to NaN for incomplete spans. */
  private readonly spanEnds: number[] = [];

  /** The offset of each incomplete span, in the order created.  */
  private readonly openSpans: number[] = [];

  get length() {
    return this.reqs.length;
  }

  getPlayout(): Playout {
    if (this.level > 0) {
      throw new Error("unclosed span");
    }

    return {
      picks: this.picks.slice(),
      spanStarts: this.spanStarts.slice(),
      spanEnds: this.spanEnds.slice(),
    };
  }

  getPick(index: number) {
    return { req: this.reqs[index], pick: this.picks[index] };
  }

  getReplies(): number[] {
    return this.picks.slice();
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

  get level(): number {
    return this.openSpans.length;
  }

  startSpan(): void {
    const spanIndex = this.spanStarts.length;
    this.spanStarts.push(this.reqs.length);
    this.spanEnds.push(NaN);
    this.openSpans.push(spanIndex);
  }

  endSpan(level?: number): void {
    const spanIndex = this.openSpans.pop();
    if (spanIndex === undefined) {
      throw new Error("no open span");
    }
    if (level !== undefined && level !== this.openSpans.length + 1) {
      throw new Error(
        `invalid span level. Want: ${this.openSpans.length + 1}, got: ${level}`,
      );
    }
    this.spanEnds[spanIndex] = this.reqs.length;
  }

  /** Returns the index where the most recently opened span started. */
  getSpanStart(): number | undefined {
    if (this.openSpans.length === 0) return undefined;
    return this.spanStarts[this.openSpans[this.openSpans.length - 1]];
  }

  clear() {
    this.reqs.length = 0;
    this.picks.length = 0;
    this.clearSpans();
  }

  clearSpans() {
    this.spanStarts.length = 0;
    this.spanEnds.length = 0;
    this.openSpans.length = 0;
  }

  removeLastSpan(): void {
    const spanIndex = this.openSpans.pop();
    if (spanIndex === undefined) {
      throw new Error("no open span");
    }
    const start = this.spanStarts[spanIndex];
    this.reqs.splice(start);
    this.picks.splice(start);
    this.spanStarts.splice(spanIndex);
    this.spanEnds.splice(spanIndex);
  }

  truncate(pickCount: number) {
    this.clearSpans();
    this.reqs.length = pickCount;
    this.picks.length = pickCount;
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
  record(): SpanPicker {
    this.log.clear();
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
  play(): SpanPicker {
    this.playOffset = 0;

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
        const prev = this.log.getPick(this.playOffset);
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
        start: () => new ParserInput(this.log.getReplies()),
      };
    };

    const startSpan = (): number => {
      checkAlive();
      this.log.startSpan();
      return this.log.level;
    };

    const cancelSpan = (level?: number) => {
      checkAlive();
      if (this.playOffset < this.log.length) {
        throw new Error("can't retry span when replaying");
      }
      if (level !== undefined && level !== this.log.level) {
        throw new Error(
          `invalid span level. Want: ${this.log.level}, got: ${level}`,
        );
      }

      this.log.removeLastSpan();
      this.recordedPicks.splice(this.log.length);
    };

    const endSpan = (level?: number) => {
      checkAlive();
      this.log.endSpan(level);
    };

    return { pick, freeze, startSpan, cancelSpan, endSpan };
  }

  /**
   * Starts a replay using a new combination of picks. Returns null when all
   * combinations have been tried.
   *
   * It increments the top pick on the stack, wrapping around to the minimum
   * value if needed. If all picks have been used, it pops the stack and tries
   * again.
   */
  playNext(): SpanPicker | null {
    this.playOffset = 0;
    this.log.clearSpans();

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
   * Invalidates the current picker, so no more picks can be recorded.
   * Returns the playout, unless it's incomplete due to open spans.
   */
  stopRecording(): Playout {
    this.proxyCount++; // invalidate current proxy
    if (this.playing) {
      throw new Error("can't stop recording while playing");
    }
    return this.log.getPlayout();
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

      if (i < picks.length) {
        current.push(picks[i]);
      }

      while (
        spanEndStack.length > 0 && spanEndStack[spanEndStack.length - 1] === i
      ) {
        // end the current list
        current = resultStack.pop() as NestedPicks;
        spanEndStack.pop();
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
export type WalkFunction<T> = (path: SpanPicker) => T | typeof NOT_FOUND;

/**
 * Visits every leaf in a search tree in order, depth-first. Starts by taking
 * all default choices.
 */
export function* walkAllPaths<T>(
  walk: WalkFunction<T>,
): Generator<Solution<T>> {
  const stack = new PickStack(alwaysPickDefault);
  let next: SpanPicker | null = stack.record();
  while (next !== null) {
    const val = walk(next);
    if (stack.playing) {
      throw "didn't read every value";
    }
    const playout = stack.stopRecording();
    if (playout === undefined) {
      throw new Error("didn't close every span");
    }
    if (val !== NOT_FOUND) {
      yield new Solution(val, playout);
    }
    next = stack.playNext();
  }
}
