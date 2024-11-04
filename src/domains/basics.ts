import type { PickifyFunction, PropShape, SendErr } from "@/domain.ts";

import { Arbitrary } from "@/arbitrary.ts";
import * as arb from "@/arbs.ts";
import { Domain, PropDomain } from "@/domain.ts";
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
  function intDomain(pickify: (val: number) => number[]) {
    return Domain.make(
      arb.int(min, max),
      (val, sendErr) => {
        if (typeof val !== "number" || !Number.isSafeInteger(val)) {
          sendErr("not a safe integer", val);
          return undefined;
        }
        if (val < min || val > max) {
          sendErr(`not in range [${min}, ${max}]`, val);
          return undefined;
        }
        return pickify(val);
      },
    );
  }

  if (min >= 0) {
    return intDomain((val) => [val]);
  } else if (max <= 0) {
    return intDomain((val) => [-val]);
  } else {
    return intDomain((val) => {
      if (val < 0) {
        return [1, -val];
      } else {
        return [0, val];
      }
    });
  }
}

/** Options for {@link record}. */
export type RecordOpts = {
  /** Turns on checking for extra properties. */
  strict?: boolean;
};

/**
 * Creates a Domain that accepts records with at least the given fields.
 *
 * Extra fields are normally allowed, unless the `strict` option is set.
 */
export function record<T extends Record<string, unknown>>(
  shape: PropShape<T>,
  opts?: RecordOpts,
): PropDomain<T> {
  const pickify: PickifyFunction = (val, sendErr) => {
    if (!checkRecordKeys(val, shape, sendErr, opts)) {
      return undefined;
    }

    const out: number[] = [];
    for (const key of Object.keys(shape)) {
      const propVal = val[key as keyof typeof val];
      const picks = shape[key].innerPickify(propVal, sendErr, key);
      if (picks === undefined) return undefined;
      out.push(...picks);
    }
    return out;
  };

  const build = Arbitrary.record<T>(shape).buildScript;

  return new PropDomain(pickify, build, shape);
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
  }, { lazyInit: true });
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

  return Domain.make(gen, (val, sendErr, name) => {
    const errors: string[] = [];

    const nestedErr: SendErr = (err, _val, loc) => {
      if (err.includes("\n")) {
        // indent non-blank lines in the nested error message
        err = err.split("\n").map((line, i) =>
          i === 0 || !line ? line : "  " + line
        ).join("\n");
      }
      if (loc) {
        errors.push(`  ${loc.at}: ${err}\n`);
      } else {
        errors.push(`  ${err}\n`);
      }
    };

    for (const [i, c] of cases.entries()) {
      const picks = c.innerPickify(val, nestedErr);
      if (picks !== undefined) return [i, ...picks];
    }
    sendErr(
      `no case matched${name === "oneOf" ? "" : ` '${name}'`}:\n${
        errors.join("")
      }`,
      val,
    );
    return undefined;
  });
}

/**
 * Creates a Domain that's the union of RecordDomains that all have a property
 * in common.
 *
 * The first Domain where the tag property matches will be used to validate the
 * rest of the value.
 */
export function taggedUnion<T extends Record<string, unknown>>(
  tagProp: string,
  cases: PropDomain<T>[],
): Domain<T> {
  if (cases.length === 0) {
    throw new Error("taggedUnion requires at least one case");
  }

  const tagPatterns: Domain<unknown>[] = [];
  for (const c of cases) {
    const pattern = c.propAt(tagProp);
    if (!pattern) {
      throw new Error(`case '${c.name}' doesn't have a '${tagProp}' property`);
    }
    tagPatterns.push(pattern);
  }

  const pickify: PickifyFunction = (val, sendErr, name) => {
    if (val === null || typeof val !== "object") {
      sendErr("not an object", val);
      return undefined;
    }

    const hasTag: { [key in string]?: unknown } = val;
    const actual = hasTag[tagProp];
    if (typeof actual !== "string") {
      sendErr(`'${tagProp}' property is not a string`, val);
      return undefined;
    }
    for (let i = 0; i < cases.length; i++) {
      const c = cases[i];
      if (!tagPatterns[i].matches(actual)) {
        continue; // tag didn't match
      }
      const picks = c.innerPickify(val, sendErr);
      if (picks === undefined) {
        return undefined; // rest of pattern didn't match
      }
      return [i, ...picks];
    }
    sendErr(`${tagProp}: "${actual}" didn't match any case in '${name}'`, val);
  };

  const build = arb.oneOf(...cases).with({ name: "taggedUnion" });

  return Domain.make(build, pickify, { lazyInit: true });
}
