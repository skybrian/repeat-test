import { Arbitrary, ChoiceRequest, Choices } from "./core.ts";

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

  gen<T>(req: Arbitrary<T>): T {
    return req.parse(this);
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

/** Parses an array of choices using an Arbitrary. */
export function parse<T>(
  arb: Arbitrary<T>,
  choices: number[],
): Success<T> | ParseFailure<T> {
  const it = new ArrayChoices(choices);
  const val = arb.parse(it);
  if (it.failed) {
    return { ok: false, guess: val, errorOffset: it.errorOffset! };
  }
  return { ok: true, value: val };
}
