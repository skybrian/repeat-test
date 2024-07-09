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
 * Requests a safe integer in a given range, with optional hints to the picker.
 *
 * When {@link IntPicker.isRandom} is true and {@link PickRequestOptions.bias}
 * isn't set, requests that the number should be picked using a uniform
 * distribution. Otherwise, the reply can be any number within range.
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

  get size(): number {
    return this.max - this.min + 1;
  }

  get range() {
    return [this.min, this.max];
  }

  /** Returns true if the given number satisfies this request. */
  inRange(n: number): boolean {
    return inRange(n, this.min, this.max);
  }

  toString() {
    return `PickRequest(${this.min}, ${this.max})`;
  }
}

/**
 * A state machine that picks an integer, given a request.
 * (Like an iterator, this is mutable.)
 */
export interface IntPicker {
  /**
   * True if this picker picks using an approximately uniform random
   * distribution when {@link PickRequest.bias} is not set.
   */
  get isRandom(): boolean;

  /**
   * Transitions to a new state and returns a pick satisfying
   * {@link PickRequest.inRange}.
   */
  pick(req: PickRequest): number;
}

export const alwaysPickDefault: IntPicker = {
  isRandom: false,
  pick: (req) => req.default,
};

export const alwaysPickMin: IntPicker = {
  isRandom: false,
  pick: (req) => req.min,
};

/**
 * Returns a single-state picker that always picks the same number.
 *
 * It will throw an exception if it can't satisfy a request.
 */
export function alwaysPick(n: number) {
  const picker: IntPicker = {
    isRandom: false,
    pick: (req) => {
      if (!req.inRange(n)) {
        throw new Error(
          `can't satisfy request for (${req.min}, ${req.max}) with ${n}`,
        );
      }
      return n;
    },
  };
  return picker;
}

/**
 * A picker that can back up to a previous point in a pick sequence and try a
 * different path.
 */
export interface RetryPicker extends IntPicker {
  /**
   * The number of picks so far. Also, the current depth in a search tree.
   */
  get depth(): number;

  /**
   * Returns true if the picker is replaying a previously-determined pick
   * sequence.
   *
   * While replay is true, calls to {@link RetryPicker.pick} have to pass in a
   * request with the same range as last time, or it will throw an Error.
   *
   * (It will diverge before replaying the entire sequence.)
   */
  get replaying(): boolean;

  /**
   * Attempts to finish the current playout and return to a previous point in
   * the pick sequence where there is another playout.
   *
   * If successful, the picker might start replaying previous picks. (See
   * {@link replaying}.)
   *
   * If it fails, there's no next playout at the given depth, and the caller
   * should try again with a lower depth.
   *
   * If `backTo(0)` return false, the entire tree has been searched.
   */
  backTo(depth: number): boolean;

  /**
   * Returns the picks made so far.
   */
  getPicks(): number[];
}

/**
 * Converts an IntPicker to a RetryPicker, without backtracking.
 *
 * It just logs the picks.
 */
export function retryPicker(picker: IntPicker, maxTries: number): RetryPicker {
  const picks: number[] = [];
  let tries = 0;

  return {
    get isRandom() {
      return picker.isRandom;
    },
    get depth() {
      return picks.length;
    },
    get replaying() {
      return false;
    },

    pick(req) {
      const pick = picker.pick(req);
      picks.push(pick);
      return pick;
    },
    backTo: function (depth: number): boolean {
      tries += 1;
      if (tries >= maxTries) return false;
      picks.length = depth;
      return true;
    },

    getPicks: function (): number[] {
      return picks.slice();
    },
  };
}

/**
 * A picker that provides a single playout and checks for mismatches.
 */
export class StrictPicker implements RetryPicker {
  private actual: number[] = [];
  private rangeError?: string = undefined;

  constructor(private readonly expected: number[]) {}

  get isRandom() {
    return false;
  }

  get depth() {
    return this.actual.length;
  }

  getPicks(): number[] {
    return this.actual.slice();
  }

  get replaying(): boolean {
    return this.actual.length < this.expected.length;
  }

  backTo(_depth: number): boolean {
    return false;
  }

  pick(req: PickRequest): number {
    if (this.actual.length >= this.expected.length) {
      this.actual.push(req.default);
      return req.default;
    }
    const pick = this.expected[this.actual.length];
    if (!req.inRange(pick) && this.rangeError === undefined) {
      this.rangeError =
        `pick at offset ${this.actual.length} is not in requested range. Want: (${req.min}, ${req.max}). Got: ${pick}`;
      this.actual.push(req.default);
      return req.default;
    }
    this.actual.push(pick);
    return pick;
  }

  get error(): string | undefined {
    if (this.rangeError) return this.rangeError;
    if (this.actual.length !== this.expected.length) {
      return `expected ${this.expected.length} picks; got ${this.actual.length}`;
    }
    return undefined;
  }
}

/** A request-reply pair that represents one call to an {@link IntPicker}. */
export type PickEntry = {
  req: PickRequest;
  reply: number;
};
