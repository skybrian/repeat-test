import { ArrayChoices } from "./choices.ts";
import { Arbitrary, ArbitraryInput, RETRY } from "./arbitraries.ts";

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
