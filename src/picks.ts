import { Failure, Success, success } from "./results.ts";

/**
 * Randomly picks an integer from a uniform distribution.
 *
 * Precondition: min and max are safe integers.
 * Postcondition: see {@link inRange}.
 */
export type UniformIntPicker = (min: number, max: number) => number;

function inRange(n: number, min: number, max: number) {
  return Number.isSafeInteger(n) && n >= min && n <= max;
}

/**
 * Picks an integer from a random distribution.
 *
 * The range is unspecified (given by context).
 *
 * @param uniform A source of random numbers.
 */
export type BiasedIntPicker = (uniform: UniformIntPicker) => number;

export function uniformBias(min: number, max: number): BiasedIntPicker {
  return (uniform: UniformIntPicker) => uniform(min, max);
}

export type PickRequestOptions = {
  /**
   * Overrides the default value for this request. This number should satisfy
   * {@link inRange} for the request.
   */
  default?: number;

  /**
   * Overrides the distribution for this request. The output should satisfy
   * {@link inRange} for the request.
   */
  bias?: BiasedIntPicker;
};

/**
 * Chooses a suitable default for an integer range.
 *
 * If not overridden, it's the number closest to zero between min and max.
 */
export function chooseDefault(
  min: number,
  max: number,
  opts?: { default?: number },
) {
  const override = opts?.default;
  if (override !== undefined) {
    if (!inRange(override, min, max)) {
      throw new Error(
        `the default must be in the range (${min}, ${max}); got ${override}`,
      );
    }
    return override;
  } else if (min >= 0) {
    return min;
  } else if (max <= 0) {
    return max;
  } else {
    return 0;
  }
}

/**
 * Requests a integer within a given range, with optional hints to the picker.
 */
export class PickRequest {
  /**
   * The distribution to use when picking randomly.
   *
   * The output is assumed to satisfy {@link PickRequest.inRange}.
   */
  readonly bias: BiasedIntPicker;

  /**
   * A default pick that can be used when not picking randomly.
   *
   * Invariant: satisfies {@link inRange}.
   */
  readonly default: number;

  /**
   * Constructs a new request.
   *
   * When picking randomly, uses a uniform distribution unless overridden by
   * {@link PickRequestOptions.bias}.
   *
   * The request's default value will be the number closest to zero that's
   * between min and max, unless overridden by
   * {@link PickRequestOptions.default}.
   */
  constructor(
    readonly min: number,
    readonly max: number,
    opts?: PickRequestOptions,
  ) {
    if (!Number.isSafeInteger(min)) {
      throw new Error(`min must be a safe integer; got ${min}`);
    }
    if (!Number.isSafeInteger(max)) {
      throw new Error(`max must be a safe integer; got ${max}`);
    }
    if (min > max) {
      throw new Error(
        `the range (min, max) must not be empty; got ${min} > ${max}`,
      );
    }
    this.default = chooseDefault(min, max, opts);
    this.bias = opts?.bias ?? uniformBias(min, max);
  }

  /** Returns true if the given number satisfies this request. */
  inRange(n: number): boolean {
    return inRange(n, this.min, this.max);
  }
}

/**
 * A state machine that picks an integer, given a request.
 * (Like an iterator, this is mutable.)
 */
export interface IntPicker {
  /**
   * Transitions to a new state and returns a pick satisfying
   * {@link PickRequest.inRange}.
   */
  pick(req: PickRequest): number;

  /** Extracts the picker's current state. It can be used to clone it. */
  freeze(): PickState;
}

/**
 * An immutable starting point for creating an {@link IntPicker}.
 * It represents a single state of the picker's state machine.
 */
export interface PickState {
  start(): IntPicker;
}

export const alwaysPickDefault: IntPicker = {
  pick: (req) => req.default,
  freeze: () => ({ start: () => alwaysPickDefault }),
};

export const alwaysPickMin: IntPicker = {
  pick: (req) => req.min,
  freeze: () => ({ start: () => alwaysPickMin }),
};

/**
 * Returns a single-state picker that always picks the same number.
 *
 * It will throw an exception if it can't satisfy a request.
 */
export function alwaysPick(n: number) {
  const picker: IntPicker = {
    pick: (req) => {
      if (!req.inRange(n)) {
        throw new Error(
          `can't satisfy request for (${req.min}, ${req.max}) with ${n}`,
        );
      }
      return n;
    },
    freeze: () => ({ start: () => picker }),
  };
  return picker;
}

export interface ParseFailure<T> extends Failure {
  guess: T;
  errorOffset: number;
}

/**
 * Input to a parser that converts picks into a value.
 *
 * For a successful parse, the parser must take each pick given in the constructor.
 *
 * As a form of error recovery, invalid picks are skipped. If more picks are needed
 * after the input runs out, a request's default value will be returned.
 *
 * To check for a parse error after parsing is done, use {@link finish}.
 */
export class ParserInput implements IntPicker {
  offset: number = 0;
  errorOffset: number | null = null;

  constructor(private picks: number[]) {}

  pick(req: PickRequest): number {
    while (this.offset < this.picks.length) {
      const offset = this.offset++;
      const pick = this.picks[offset];
      if (req.inRange(pick)) {
        return pick;
      }
      if (this.errorOffset === null) {
        this.errorOffset = offset;
      }
      // retry with next value.
    }

    // ran off the end, so use the default value.
    if (this.errorOffset === null) {
      this.errorOffset = this.picks.length;
    }
    return req.default;
  }

  /** Returns the remaining input. */
  freeze(): PickState {
    const picks = this.picks.slice(this.offset);
    return {
      start: () => new ParserInput(picks),
    };
  }

  finish<T>(val: T): Success<T> | ParseFailure<T> {
    if (!this.errorOffset && this.offset !== this.picks.length) {
      this.errorOffset = this.offset;
    }

    if (this.errorOffset !== null) {
      return { ok: false, guess: val, errorOffset: this.errorOffset };
    }

    return success(val);
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

  // Invariant: reqs.length == recordedPicks.length == playPicks.length
  // (Parallel stacks.)

  /** The requests originally recorded. */
  private readonly reqs: PickRequest[] = [];

  /** The picks originally recorded. */
  private readonly recordedPicks: number[] = [];

  /**
   * The picks to use for playback.
   * (Some will be different from the recorded pick after calling {@link playNext}.)
   */
  private playPicks: number[] = [];

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
    return this.reqs.length;
  }

  /**
   * Returns true if there are recorded picks that haven't been replayed.
   */
  get playing() {
    return this.playOffset < this.reqs.length;
  }

  /**
   * Clears the log and starts recording. Returns the picker to use.
   *
   * The picker's lifetime is until the next call to either {@link record} or
   * {@link play}.
   */
  record(): IntPicker {
    this.reqs.length = 0;
    this.recordedPicks.length = 0;
    return this.play();
  }

  /**
   * Starts replaying the log, using a new picker. After reaching the end, it
   * will start recording again.
   *
   * The picker's lifetime is until the next call to either {@link record} or
   * {@link play}.
   */
  play(): IntPicker {
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

      if (this.playOffset < this.reqs.length) {
        // replaying
        const prev = this.reqs[this.playOffset];
        if (prev.min !== req.min || prev.max !== req.max) {
          throw new Error(
            "when replaying, pick() must be called with the same request as before",
          );
        }
        const pick = this.playPicks[this.playOffset];
        this.playOffset++;
        return pick;
      }

      // recording
      if (this.playOffset === this.maxStackSize) {
        throw new Error(
          `pick log is full (max size: ${this.maxStackSize})`,
        );
      }
      const pick = this.wrapped.pick(req);
      this.reqs.push(req);
      this.recordedPicks.push(pick);
      this.playPicks.push(pick);
      this.playOffset += 1;
      return pick;
    };

    const freeze = (): PickState => {
      checkAlive();
      return {
        start: () => new ParserInput(this.playPicks.slice(this.playOffset)),
      };
    };

    return { pick, freeze };
  }

  /**
   * Starts a replay using a combination of picks that was not recorded or
   * previously played back since the last recording. Returns null when all
   * combinations have been tried.
   *
   * It increments the top pick on the stack, wrapping around to the minimum
   * value if needed. If all picks have been used, it pops the stack and tries
   * again.
   */
  playNext(): IntPicker | null {
    const nextPick = (req: PickRequest, pick: number): number => {
      return (pick === req.max) ? req.min : pick + 1;
    };

    for (let i = this.length - 1; i >= 0; i--) {
      const req = this.reqs[i];
      const pick = this.playPicks[i];
      const next = nextPick(req, pick);
      if (next !== this.recordedPicks[i]) {
        this.playPicks[i] = next;
        return this.play();
      }

      // We exhausted all possibilties for the last pick request.
      this.reqs.pop();
      this.recordedPicks.pop();
      this.playPicks.pop();
    }

    // We exhausted all pick requests on the stack.
    return null;
  }
}
