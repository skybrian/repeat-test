import { Arbitrary, ChoiceRequest, Choices } from "./src/types.ts";

/**
 * Choices that are stored in an array.
 *
 * After the array runs out, returns the request's default value.
 */
export class SavedChoices implements Choices {
  offset: number = 0;

  constructor(private data: number[]) {}

  next(req: ChoiceRequest): number {
    const { min, max } = req;
    while (this.offset < this.data.length) {
      const num = this.data[this.offset++];
      if (num >= min && num <= max) {
        return num;
      }
      // mismatch found, try again
    }

    // After the end of the saved data, return the default value.
    return req.default;
  }

  gen<T>(req: Arbitrary<T>): T {
    return req.parse(this);
  }
}
