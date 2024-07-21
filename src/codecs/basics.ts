import { AnyRecord } from "../types.ts";
import { RecordShape as ArbRecordShape } from "../arbitrary_class.ts";
import * as arb from "../arbitraries.ts";
import Codec from "../codec_class.ts";

export function of<T>(...values: T[]): Codec<T> {
  const domain = arb.of(...values);
  return new Codec(domain, (val) => {
    const sol = domain.findSolution((s) => s === val);
    if (!sol) return undefined;
    return sol.playout.picks.replies;
  });
}

export const boolean = of(false, true).asFunction();

export function int(min: number, max: number): Codec<number> {
  const domain = arb.int(min, max);

  const inDomain = (val: unknown): val is number => {
    if (typeof val !== "number" || !Number.isSafeInteger(val)) {
      return false;
    }
    return val >= min && val <= max;
  };

  if (min >= 0) {
    return new Codec(domain, (val) => inDomain(val) ? [val] : undefined);
  } else if (max <= 0) {
    return new Codec(domain, (val) => inDomain(val) ? [-val] : undefined);
  } else {
    return new Codec(
      domain,
      (val) => inDomain(val) ? [val < 0 ? 1 : 0, Math.abs(val)] : undefined,
    );
  }
}

export type RecordShape<T> = {
  [K in keyof T]: Codec<T[K]>;
};

export function record<T extends AnyRecord>(
  fields: RecordShape<T>,
): Codec<T> {
  const fieldKeys = Object.keys(fields) as (keyof T)[];
  const fieldDomains: Partial<ArbRecordShape<T>> = {};
  for (const key of fieldKeys) {
    fieldDomains[key] = fields[key].domain;
  }
  const domain = arb.record(fieldDomains as ArbRecordShape<T>);

  return new Codec(
    domain,
    (val) => {
      if (val === null || typeof val !== "object") return undefined;
      for (const key of Object.keys(val)) {
        if (!(key in fields)) return undefined;
      }

      const out: number[] = [];
      for (const key of fieldKeys) {
        const fieldVal = val[key as keyof typeof val];
        const encoded = fields[key].maybeEncode(fieldVal);
        if (encoded === undefined) return undefined;
        out.push(...encoded);
      }
      return out;
    },
  );
}

export function array<T>(
  item: Codec<T>,
  opts?: { min?: number; max?: number },
): Codec<T[]> {
  const domain = arb.array(item.domain, opts);
  const min = opts?.min ?? 0;
  const max = opts?.max ?? arb.defaultArrayLimit;

  const inDomain = (val: unknown): val is T[] => {
    if (!Array.isArray(val)) return false;
    return (val.length >= min && val.length <= max);
  };

  return new Codec(domain, (val) => {
    if (!inDomain(val)) return undefined;
    const out: number[] = [];

    let i = 0;

    // Fixed-length portion.
    while (i < min) {
      const encoded = item.maybeEncode(val[i]);
      if (encoded === undefined) return undefined;
      out.push(...encoded);
      i++;
    }

    // Variable-length portion.
    while (i < val.length) {
      const encoded = item.maybeEncode(val[i]);
      if (encoded === undefined) return undefined;
      out.push(1);
      out.push(...encoded);
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
export function oneOf<T>(cases: Codec<T>[]): Codec<T> {
  if (cases.length === 0) {
    throw new Error("oneOf must have at least one choice");
  } else if (cases.length === 1) {
    return cases[0];
  }

  const domain = arb.oneOf(cases.map((c) => c.domain));

  return new Codec(domain, (val) => {
    for (const [i, c] of cases.entries()) {
      const picks = c.maybeEncode(val);
      if (picks !== undefined) return [i, ...picks];
    }
    return undefined;
  });
}
