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
   * Cancels the last open span and restarts it.
   * The picks since the last span start are discarded.
   * (The level is unchanged.)
   */
  retrySpan(): void;

  /**
   * Ends a span.
   *
   * It optionally takes the level of the span to end.
   *
   * This should be the number returned by {@link begin}. (Otherwise an
   * exception will be thrown.)
   */
  endSpan(): void;
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

  getPlayout(): Playout | undefined {
    if (this.level > 0) return undefined;

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

  truncate(pickCount: number) {
    this.reqs.length = pickCount;
    this.picks.length = pickCount;

    // Find the last span that started before the truncation point.
    let lastStarted = this.spanStarts.length - 1;
    while (lastStarted >= 0 && this.spanStarts[lastStarted] >= pickCount) {
      lastStarted--;
    }

    // Remove references to open spans that started after the truncation point.
    let lastOpen = this.openSpans.length - 1;
    while (lastOpen >= 0 && this.openSpans[lastOpen] > lastStarted) {
      lastOpen--;
    }

    this.spanStarts.length = lastStarted + 1;
    this.spanEnds.length = lastStarted + 1;
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

    const retrySpan = () => {
      checkAlive();
      if (this.playOffset < this.log.length) {
        throw new Error("can't retry span when replaying");
      }

      const start = this.log.getSpanStart();
      if (start === undefined) throw new Error("no open spans");

      this.log.truncate(start);
      this.recordedPicks.splice(start);
      startSpan();
    };

    const endSpan = (level?: number) => {
      checkAlive();
      this.log.endSpan(level);
    };

    return { pick, freeze, startSpan, retrySpan, endSpan };
  }

  /**
   * Starts a replay using a new combination of picks. Returns null when all
   * combinations have been tried.
   *
   * It increments the top pick on the stack, wrapping around to the minimum
   * value if needed. If all picks have been used, it pops the stack and tries
   * again.
   */
  playNext(): IntPicker | null {
    this.playOffset = 0;

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
  stopRecording(): Playout | undefined {
    this.proxyCount++; // invalidate current proxy
    if (this.playing) {
      throw new Error("can't stop recording while playing");
    }
    return this.log.getPlayout();
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
export type WalkFunction<T> = (path: IntPicker) => T | typeof NOT_FOUND;

export type Solution<T> = {
  val: T;
  playout: Playout;
};

/**
 * Visits every leaf in a search tree in order, depth-first. Starts by taking
 * all default choices.
 */
export function* walkAllPaths<T>(
  walk: WalkFunction<T>,
): Generator<Solution<T>> {
  const stack = new PickStack(alwaysPickDefault);
  let next: IntPicker | null = stack.record();
  while (next !== null) {
    const val = walk(next);
    if (stack.playing) {
      throw "didn't read every value";
    }
    const playout = stack.stopRecording();
    if (playout === undefined) {
      throw "didn't close every span";
    }
    if (val !== NOT_FOUND) {
      yield { val, playout };
    }
    next = stack.playNext();
  }
}
