import { AnyRecord } from "../types.ts";
import { RecordShape as ArbRecordShape } from "../arbitrary_class.ts";
import * as arb from "../arbitraries.ts";
import Domain from "../domain_class.ts";

export function of<T>(...values: T[]): Domain<T> {
  const generator = arb.of(...values);
  return new Domain(generator, (val) => {
    const gen = generator.findGenerated((s) => s === val);
    if (!gen) return undefined;
    return gen.replies();
  });
}

export const boolean = of(false, true).asFunction();

export function int(min: number, max: number): Domain<number> {
  const gen = arb.int(min, max);

  const accept = (val: unknown): val is number => {
    if (typeof val !== "number" || !Number.isSafeInteger(val)) {
      return false;
    }
    return val >= min && val <= max;
  };

  if (min >= 0) {
    return new Domain(gen, (val) => accept(val) ? [val] : undefined);
  } else if (max <= 0) {
    return new Domain(gen, (val) => accept(val) ? [-val] : undefined);
  } else {
    return new Domain(
      gen,
      (val) => accept(val) ? [val < 0 ? 1 : 0, Math.abs(val)] : undefined,
    );
  }
}

export type RecordShape<T> = {
  [K in keyof T]: Domain<T[K]>;
};

export function record<T extends AnyRecord>(
  fields: RecordShape<T>,
): Domain<T> {
  const fieldKeys = Object.keys(fields) as (keyof T)[];
  const fieldGens: Partial<ArbRecordShape<T>> = {};
  for (const key of fieldKeys) {
    fieldGens[key] = fields[key].generator;
  }
  const gen = arb.record(fieldGens as ArbRecordShape<T>);

  return new Domain(
    gen,
    (val) => {
      if (val === null || typeof val !== "object") return undefined;
      for (const key of Object.keys(val)) {
        if (!(key in fields)) return undefined;
      }

      const out: number[] = [];
      for (const key of fieldKeys) {
        const fieldVal = val[key as keyof typeof val];
        const picks = fields[key].maybePickify(fieldVal);
        if (picks === undefined) return undefined;
        out.push(...picks);
      }
      return out;
    },
  );
}

export function array<T>(
  item: Domain<T>,
  opts?: { min?: number; max?: number },
): Domain<T[]> {
  const gen = arb.array(item.generator, opts);
  const min = opts?.min ?? 0;
  const max = opts?.max ?? arb.defaultArrayLimit;

  const accept = (val: unknown): val is T[] => {
    if (!Array.isArray(val)) return false;
    return (val.length >= min && val.length <= max);
  };

  return new Domain(gen, (val) => {
    if (!accept(val)) return undefined;
    const out: number[] = [];

    let i = 0;

    // Fixed-length portion.
    while (i < min) {
      const picks = item.maybePickify(val[i]);
      if (picks === undefined) return undefined;
      out.push(...picks);
      i++;
    }

    // Variable-length portion.
    while (i < val.length) {
      const picks = item.maybePickify(val[i]);
      if (picks === undefined) return undefined;
      out.push(1);
      out.push(...picks);
      i++;
    }
    if (min < max) {
      out.push(0);
    }
    return out;
  });
}

/**
 * A codec that encodes a value using the first child codec that accepts it.
 */
export function oneOf<T>(cases: Domain<T>[]): Domain<T> {
  if (cases.length === 0) {
    throw new Error("oneOf must have at least one choice");
  } else if (cases.length === 1) {
    return cases[0];
  }

  const gen = arb.oneOf(cases.map((c) => c.generator));

  return new Domain(gen, (val) => {
    for (const [i, c] of cases.entries()) {
      const picks = c.maybePickify(val);
      if (picks !== undefined) return [i, ...picks];
    }
    return undefined;
  });
}
