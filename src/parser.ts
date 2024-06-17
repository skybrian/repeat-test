import { ChoiceRequest, Choices } from "./choices.ts";
import { Arbitrary, ArbitraryInput, RETRY } from "./arbitraries.ts";

/**
 * Iterates over choices that are stored in an array.
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

type Success<T> = {
  ok: true;
  value: T;
};

type ParseFailure<T> = {
  ok: false;
  guess: T;
  errorOffset: number;
};

/**
 * Parses an array of choices using an Arbitrary.
 *
 * Doesn't retry; all filters must succeed the first time with the given data,
 * or the parse fails.
 */
export function parse<T>(
  arb: Arbitrary<T>,
  choices: number[],
): Success<T> | ParseFailure<T> {
  const input = new ArrayChoices(choices);
  const val = new ArbitraryInput(input, 1).gen(arb);
  if (val === RETRY) {
    return { ok: false, guess: arb.default, errorOffset: input.offset };
  } else if (input.failed) {
    return { ok: false, guess: val, errorOffset: input.errorOffset! };
  }
  return { ok: true, value: val };
}
