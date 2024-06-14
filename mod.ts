import { Arbitrary, ChoiceRequest, Choices } from "./src/types.ts";

/**
 * Choices that are stored in an array.
 *
 * After the array runs out, the minimum value that satisfies the request
 * will be returned.
 */
export class SavedChoices implements Choices {
  offset: number = 0;

  constructor(private data: number[]) {}

  next(arb: ChoiceRequest): number {
    const { min, max } = arb;
    while (this.offset < this.data.length) {
      const num = this.data[this.offset++];
      if (num >= min && num <= max) {
        return num;
      }
      // mismatch found, try again
    }

    // After the end of the saved data, return the default value.
    return min;
  }

  gen<T>(arb: Arbitrary<T>): T {
    return arb.parse(this);
  }
}
