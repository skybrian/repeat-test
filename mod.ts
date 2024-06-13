import { Choices } from "./simple.ts";

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
