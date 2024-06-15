import { Arbitrary, ChoiceRequest, Choices } from "./choices.ts";

/**
 * Replays choices that are stored in an array.
 */
export class ArrayChoices implements Choices {
  offset: number = 0;
  failureOffset: number | null = null;

  constructor(private answers: number[]) {}

  get failed() {
    return this.failureOffset !== null;
  }

  next(req: ChoiceRequest): number {
    while (this.offset < this.answers.length) {
      const offset = this.offset++;
      const choice = this.answers[offset];
      if (req.isValid(choice)) {
        return choice;
      }
      if (this.failureOffset === null) {
        this.failureOffset = offset;
      }
      // retry with next value.
    }

    // ran off the end.
    if (this.failureOffset === null) {
      this.failureOffset = this.answers.length;
    }
    return req.default;
  }

  gen<T>(req: Arbitrary<T>): T {
    return req.parse(this);
  }
}
