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

export const boolean = of(false, true).asFunction();

export function array<T>(item: Codec<T>): Codec<T[]> {
  const domain = arb.array(item.domain);
  return new Codec(domain, (val) => {
    if (!Array.isArray(val)) return undefined;
    const out: number[] = [];
    for (const v of val) {
      const encoded = item.maybeEncode(v);
      if (encoded === undefined) return undefined;
      out.push(1);
      out.push(...encoded);
    }
    out.push(0);
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
