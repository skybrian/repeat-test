/**
 * Randomly picks an integer from a uniform distribution.
 *
 * Invariant: min <= result <= max, where min and max are safe integers.
 */
export type UniformIntPicker = (min: number, max: number) => number;

/**
 * Randomly picks an integer from a possibly non-uniform distribution.
 *
 * The range is unspecified (given by context).
 *
 * @param uniform A source of random numbers.
 */
export type BiasedIntPicker = (uniform: UniformIntPicker) => number;

/**
 * Requests a integer within a given range, with options.
 */
export class PickRequest {
  /**
   * The distribution to use when picking randomly.
   *
   * Invariant: min <= bias(uniform) <= max, where all are safe integers.
   */
  readonly bias: BiasedIntPicker;

  /**
   * A default pick that can be used when not picking randomly.
   *
   * Invariant: min <= default <= max, where they are all safe integers.
   */
  readonly default: number;

  /**
   * Constructs a new request.
   *
   * When the result is picked randomly, it will use a uniform distribution
   * unless overridden by {@link opts.bias}.
   *
   * When the result is not picked randomly, the default value may be used. If
   * not overridden by {@link opts.bias}, it will be the number closest to zero
   * that's between min and max.
   *
   * @param opts.default Overrides the default value for this request.
   *
   * @param opts.bias Overrides the distribution for this request. It should be
   * a function that picks a random integer between min and max.
   */
  constructor(
    readonly min: number,
    readonly max: number,
    opts?: { default?: number; bias?: BiasedIntPicker },
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
    const chosenDefault = opts?.default;
    if (chosenDefault !== undefined) {
      if (!this.isValidReply(chosenDefault)) {
        throw new Error(
          `the default must be within the range (${min}, ${max}); got ${chosenDefault}`,
        );
      }
      this.default = chosenDefault;
    } else if (min >= 0) {
      this.default = min;
    } else if (max <= 0) {
      this.default = max;
    } else {
      this.default = 0;
    }

    this.bias = opts?.bias ??
      ((uniform: UniformIntPicker) => uniform(min, max));
  }

  /**
   * Returns true if the given number satisfies this request.
   */
  isValidReply(n: number): boolean {
    return Number.isSafeInteger(n) && n >= this.min && n <= this.max;
  }
}

/**
 * Picks an integer, given a request.
 *
 * Invariant: req.isValidReply(result).
 */
export interface IntPicker {
  pick(req: PickRequest): number;
}

export const alwaysChooseDefault: IntPicker = { pick: (req) => req.default };
export const alwaysChooseMin: IntPicker = { pick: (req) => req.min };

/**
 * An infinite stream of integers, taken from an array until it runs out.
 *
 * Invalid picks are skipped. After the end of the array, a request's default
 * value will be returned.
 *
 * A parse is consider successful if all picks were taken from the array.
 * (TODO: check for the case where not all picks were used.)
 *
 * To check for an error, see {@link failed} and {@link errorOffset}.
 */
export class ArrayPicker implements IntPicker {
  offset: number = 0;
  errorOffset: number | null = null;

  constructor(private picks: number[]) {}

  get failed() {
    return this.errorOffset !== null;
  }

  pick(req: PickRequest): number {
    while (this.offset < this.picks.length) {
      const offset = this.offset++;
      const pick = this.picks[offset];
      if (req.isValidReply(pick)) {
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
}

/**
 * Records and replays picks made by a proxied {@link IntPicker}.
 *
 * To record, it returns a proxy IntPicker that passes requests to an underlying
 * picker and saves the requests and responses to the log.
 *
 * To replay, it returns another proxy IntPicker that throws an exception if a
 * mismatch is found (where the requested range doesn't match). After reaching
 * the end of the log, it will start recording again.
 */
export class PickLog {
  private readonly maxLogSize: number;
  private reqs: PickRequest[] = [];
  private picks: number[] = [];
  private offset = 0;
  private proxyCount = 0;

  /**
   * @param wrapped the picker to use when recording picks
   */
  constructor(
    private readonly wrapped: IntPicker,
    opts?: { maxLogSize?: number },
  ) {
    this.maxLogSize = opts?.maxLogSize ?? 1000;
  }

  /** The number of requests that have been recorded. */
  get length() {
    return this.reqs.length;
  }

  /**
   * Returns true if there are recorded picks that haven't been replayed.
   */
  get replaying() {
    return this.offset < this.picks.length;
  }

  /**
   * Clears the log and starts recording. Returns the picker to use.
   *
   * The picker's lifetime is until the next call to either {@link record} or
   * {@link replay}.
   */
  record(): IntPicker {
    this.reqs = [];
    this.picks = [];
    return this.replay();
  }

  /**
   * Starts replaying the log, using a new picker. After reaching the end, it
   * will start recording again.
   *
   * The picker's lifetime is until the next call to either {@link record} or
   * {@link replay}.
   */
  replay(): IntPicker {
    this.offset = 0;
    this.proxyCount++;
    const id = this.proxyCount;

    const pick = (req: PickRequest): number => {
      if (id !== this.proxyCount) {
        throw new Error(
          "can't use this picker anymore, because record() or replay() were called",
        );
      }
      if (this.offset < this.reqs.length) {
        // replaying
        const prev = this.reqs[this.offset];
        if (prev.min !== req.min || prev.max !== req.max) {
          throw new Error(
            "when replaying, pick() must be called with the same request as before",
          );
        }
        return this.picks[this.offset++];
      } else {
        if (this.offset === this.maxLogSize) {
          throw new Error(
            `pick log is full (max size: ${this.maxLogSize})`,
          );
        }
        // recording
        const pick = this.wrapped.pick(req);
        this.reqs.push(req);
        this.picks.push(pick);
        this.offset += 1;
        return pick;
      }
    };
    return { pick };
  }

  /**
   * Increments the log and starts replaying it.
   *
   * To increment, it removes all trailing picks that are at maximum, then
   * increments the last pick.
   *
   * If null is returned, there is no next log to replay (all picks were at
   * maximum, so they were removed).
   */
  replayNext(): IntPicker | null {
    while (this.length > 0) {
      const i = this.length - 1;
      const last = this.picks[i];
      if (last < this.reqs[i].max) {
        this.picks[i] = last + 1;
        return this.replay();
      }
      this.picks.pop();
      this.reqs.pop();
    }
    return null;
  }
}
