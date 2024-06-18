/**
 * Picks an integer within a given range.
 *
 * Invariant: min <= result <= max, where min and max are safe integers.
 */
export type RangePicker = (min: number, max: number) => number;

/**
 * Picks a random integer somehow.
 *
 * Specifies a random distribution. The range is fixed (given by context).
 *
 * @param uniform Picks a random number with a uniform distribution. (A source
 * of random numbers.)
 */
export type BiasedPicker = (uniform: RangePicker) => number;

/**
 * Requests a integer by picking from a given range, optionally using a
 * distribution or default value.
 */
export class PickRequest {
  /**
   * The distribution to use when picking randomly.
   *
   * Invariant: min <= bias(uniform) <= max, where all are safe integers.
   */
  readonly bias: BiasedPicker;

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
    opts?: { default?: number; bias?: BiasedPicker },
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

    this.bias = opts?.bias ?? ((uniform: RangePicker) => uniform(min, max));
  }

  /**
   * Returns true if the given number satisfies this request.
   */
  isValidReply(n: number): boolean {
    return Number.isSafeInteger(n) && n >= this.min && n <= this.max;
  }
}

/**
 * Picks a number, given a request.
 *
 * Invariant: req.isValidReply(result).
 */
export interface Picker {
  pick(req: PickRequest): number;
}

export const alwaysChooseDefault: Picker = { pick: (req) => req.default };

/**
 * Answers pick requests using predetermined replies, when possible.
 *
 * If a saved pick doesn't match a request, some other pick will be used,
 * possibly the default. If this happens, it's considered an error.
 *
 * To check for an error, see {@link failed} and {@link errorOffset}.
 */
export class ArrayPicker implements Picker {
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
