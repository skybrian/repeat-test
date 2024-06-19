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
