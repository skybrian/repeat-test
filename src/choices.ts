/**
 * A function that chooses a response using a random number generator.
 */
export type BiasFunction = (
  /** Picks a number between min and max (inclusive), using a uniform distribution. */
  uniform: (min: number, max: number) => number,
) => number;

/**
 * A request for a safe integer between min and max (inclusive).
 *
 * Invariant: min <= max, so the range contains at least one value.
 */
export class ChoiceRequest {
  readonly default: number;

  readonly bias: BiasFunction | null;

  /**
   * Constructs a new request. Min, max, and the default must be safe integers.
   * They must satisfy min <= default <= max.
   *
   * @param opts.default Overrides the default value for this request. If not
   * specified, it will be the number closest to zero that's between min and
   * max.
   *
   * @param opts.bias A function that picks randomly using a non-uniform
   * distribution. If not specified, a uniform distribution should be used. This
   * hint will be ignored when not generating choices randomly.
   */
  constructor(
    readonly min: number,
    readonly max: number,
    opts?: { default?: number; bias?: BiasFunction },
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
      if (!this.isValid(chosenDefault)) {
        throw new Error(
          `the default must within the range (${min}, ${max}); got ${chosenDefault}`,
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

    this.bias = opts?.bias ?? null;
  }

  isValid(n: number): boolean {
    return Number.isSafeInteger(n) && n >= this.min && n <= this.max;
  }
}

/**
 * An iterator over a infinite stream of choices.
 *
 * Each choice is represented as a safe integer that's selected from a range
 * specified by a {@link ChoiceRequest}.
 *
 * This interface is typically implemented using a random number generator, but
 * any scheme may be used.
 */
export interface Choices {
  /** Returns the next choice from the stream. */
  next(req: ChoiceRequest): number;
}

export const alwaysChooseDefault: Choices = { next: (req) => req.default };

/**
 * Answers to choice requests that are stored in an array.
 *
 * If a choice doesn't match a request, it recovers by skipping items until a
 * match is found, or returning the request's default value. As a result, a
 * parse should always succeed, but may return a different value than expected.
 *
 * To check for a parse error, see {@link failed} and {@link errorOffset}.
 */
export class ArrayChoices implements Choices {
  offset: number = 0;
  errorOffset: number | null = null;

  constructor(private answers: number[]) {}

  get failed() {
    return this.errorOffset !== null;
  }

  next(req: ChoiceRequest): number {
    while (this.offset < this.answers.length) {
      const offset = this.offset++;
      const choice = this.answers[offset];
      if (req.isValid(choice)) {
        return choice;
      }
      if (this.errorOffset === null) {
        this.errorOffset = offset;
      }
      // retry with next value.
    }

    // ran off the end.
    if (this.errorOffset === null) {
      this.errorOffset = this.answers.length;
    }
    return req.default;
  }
}
