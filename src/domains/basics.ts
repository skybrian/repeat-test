import { Domain } from "@/domain.ts";
import * as arb from "@/arbs.ts";

import { checkArray, checkRecordKeys, parseArrayOpts } from "../options.ts";

/**
 * A domain that accepts only values equal to the given arguments.
 *
 * Comparisons are done using strict equality, the same algorithm used by
 * `===`.
 */
export function of<T>(...values: T[]): Domain<T> {
  return Domain.of(...values);
}

/**
 * Returns a Domain that stands for another Domain, which might be
 * defined later.
 *
 * Since initialization is lazy, this is useful for parsing recursive types.
 *
 * Usually, the return type must be declared when definining an alias, because
 * TypeScript's type inference doesn't work for recursive types.
 */
export function alias<T>(init: () => Domain<T>): Domain<T> {
  return Domain.alias(init);
}

/** A domain that accepts only booleans. */
export const boolean: () => Domain<boolean> = Domain.of(false, true).with({
  name: "boolean",
})
  .asFunction();

/**
 * A domain that accepts safe integers within the given range (inclusive).
 */
export function int(min: number, max: number): Domain<number> {
  const gen = arb.int(min, max);

  const accept = (
    val: unknown,
    sendErr: (msg: string) => void,
  ): val is number => {
    if (typeof val !== "number" || !Number.isSafeInteger(val)) {
      sendErr("not a safe integer");
      return false;
    }
    if (val < min || val > max) {
      sendErr(`not in range [${min}, ${max}]`);
      return false;
    }
    return true;
  };

  if (min >= 0) {
    return Domain.make(gen, (val, e) => accept(val, e) ? [val] : undefined);
  } else if (max <= 0) {
    return Domain.make(gen, (val, e) => accept(val, e) ? [-val] : undefined);
  } else {
    return Domain.make(
      gen,
      (val, e) => accept(val, e) ? [val < 0 ? 1 : 0, Math.abs(val)] : undefined,
    );
  }
}

/**
 * Specifies the values accepted for each field of a record.
 */
export type RecordShape<T> = {
  [K in keyof T]: Domain<T[K]>;
};

export type RecordOpts = {
  /** Indicates that extra fields will be ignored (not parsed). */
  strip?: boolean;
};

/**
 * Creates a Domain that accepts records with matching fields.
 */
export function record<T extends Record<string, unknown>>(
  fields: RecordShape<T>,
  opts?: RecordOpts,
): Domain<T> {
  const strip = opts?.strip ?? false;
  const gen = arb.record(fields);

  return Domain.make(
    gen,
    (val, sendErr) => {
      if (!checkRecordKeys(val, fields, sendErr, { strip })) {
        return undefined;
      }

      const out: number[] = [];
      for (const key of Object.keys(fields)) {
        const fieldVal = val[key as keyof typeof val];
        const picks = fields[key].innerPickify(fieldVal, sendErr, key);
        if (picks === undefined) return undefined;
        out.push(...picks);
      }
      return out;
    },
    { dryRun: false },
  );
}

/**
 * Creates a Domain that accepts arrays where every item matches.
 */
export function array<T>(
  item: Domain<T>,
  opts?: arb.ArrayOpts,
): Domain<T[]> {
  const gen = arb.array(item, opts);
  const { min, max } = parseArrayOpts(opts);

  return Domain.make(gen, (val, sendErr) => {
    if (!checkArray(val, min, max, sendErr)) return undefined;
    const out: number[] = [];

    let i = 0;

    // Fixed-length portion.
    while (i < min) {
      const picks = item.innerPickify(val[i], sendErr, i);
      if (picks === undefined) return undefined;
      out.push(...picks);
      i++;
    }

    // Variable-length portion.
    while (i < val.length) {
      const picks = item.innerPickify(val[i], sendErr, i);
      if (picks === undefined) return undefined;
      out.push(1);
      out.push(...picks);
      i++;
    }
    if (min < max && i < max) {
      out.push(0);
    }
    return out;
  }, { dryRun: false });
}

/**
 * Creates a Domain that's the union of other Domains.
 *
 * When multiple child domains accept the same value, the encoding for the first
 * one that matches will be used. The other Domains can also generate the same
 * value, but the pick sequences they use will be non-canonical representations
 * of it.
 */
export function oneOf<T>(...cases: Domain<T>[]): Domain<T> {
  if (cases.length === 0) {
    throw new Error("oneOf must have at least one choice");
  } else if (cases.length === 1) {
    return cases[0];
  }

  const gen = arb.oneOf(...cases);

  return Domain.make(gen, (val, sendErr) => {
    const errors: string[] = [];
    for (const [i, c] of cases.entries()) {
      const picks = c.innerPickify(val, (err, loc) => {
        if (loc) {
          errors.push(`  ${loc.at}: ${err}\n`);
        } else {
          errors.push(`  ${err}\n`);
        }
      });
      if (picks !== undefined) return [i, ...picks];
    }
    sendErr(`no case matched:\n${errors.join("")}`);
    return undefined;
  });
}
