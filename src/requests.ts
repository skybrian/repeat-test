import { ChoiceRequest } from "./core.ts";
import * as arb from "./arbitraries.ts";

export type Range = { min: number; max: number };

export const invalidRange = arb.oneOf<Range>([
  arb.example([{ min: 1, max: 0 }]),
  arb.record({ min: arb.safeInt, max: arb.nonInteger }),
  arb.record({ min: arb.nonInteger, max: arb.safeInt }),
]);

export const validRange = arb.oneOf<Range>([
  arb.example([{ min: 0, max: 0 }, { min: 0, max: 1 }]),
  arb.custom((it) => {
    const extras = it.gen(arb.biasedInt(0, 100));
    const min = it.gen(
      arb.biasedInt(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - extras),
    );
    const max = min + extras;
    return { min, max };
  }),
]);

export const validRequest = arb.oneOf<ChoiceRequest>([
  arb.custom((it) => {
    const { min, max } = it.gen(validRange);
    return new ChoiceRequest(min, max);
  }),
  arb.custom((it) => {
    const { min, max } = it.gen(validRange);
    const def = it.gen(arb.biasedInt(min, max));
    return new ChoiceRequest(min, max, { default: def });
  }),
]);
