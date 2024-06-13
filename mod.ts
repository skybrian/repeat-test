import prand from "pure-rand";

/**
 * An infinite stream of choices. Each choice is a number.
 */
interface Choices {
  /**
   * Returns the next choice as a safe integer in the given range.
   * Min and max must be safe integers, with min <= max.
   */
  nextInt(min: number, max: number): number;
}

export class RandomChoices implements Choices {
  private gen: prand.RandomGenerator;

  constructor(private seed: number) {
    this.gen = prand.xoroshiro128plus(seed);
  }

  nextInt(min: number, max: number): number {
    if (!Number.isSafeInteger(min)) {
      throw new Error(`min must be a safe integer, got ${min}`);
    }
    if (!Number.isSafeInteger(max)) {
      throw new Error(`max must be a safe integer, got ${max}`);
    }
    if (min > max) {
      throw new Error(`min must be <= max, got ${min} > ${max}`);
    }

    return prand.unsafeUniformIntDistribution(min, max, this.gen);
  }
}

/**
 * An infinite stream of numbers that's based on an array.
 */
export class SavedChoices implements Choices {
  offset: number = 0;

  constructor(private data: number[]) {}

  nextInt(min: number, max: number): number {
    if (!Number.isSafeInteger(min)) {
      throw new Error(`min must be a safe integer, got ${min}`);
    }
    if (!Number.isSafeInteger(max)) {
      throw new Error(`max must be a safe integer, got ${max}`);
    }
    if (min > max) {
      throw new Error(`min must be <= max, got ${min} > ${max}`);
    }

    while (this.offset < this.data.length) {
      const num = this.data[this.offset++];
      if (num >= min && num <= max) {
        return num;
      }
      // mismatch found, try again
    }
    return min;
  }
}

export interface Arbitrary<T> {
  sample(): T;
}
