import type { Row, Script } from "@/arbitrary.ts";
import type { PickifyFunction } from "@/domain.ts";

import * as arb from "@/arbs.ts";
import { Domain } from "@/domain.ts";
import { checkKeys } from "../options.ts";

/**
 * Defines the acceptable values for some of the properties on an object.
 */
export type RowShape<T> = {
  [K in keyof T]: Domain<T[K]>;
};

/**
 * A Domain that also specifies some of its properties.
 */
export class RowDomain<T extends Record<string, unknown>> extends Domain<T> {
  constructor(
    pickify: PickifyFunction,
    build: Script<T>,
    readonly shape: RowShape<T>,
  ) {
    super(pickify, build);
  }
}

/** Options for {@link object}. */
export type ObjectOpts = {
  /** Turns on checking for extra properties. */
  strict?: boolean;
};

/**
 * A domain that matches an object when each of the given properties matches.
 *
 * Additional properties are normally allowed, unless the `strict` option is set.
 *
 * After being parsed or regenerated, the copy will only have the listed properties
 * and the copy's prototype will be Object.prototype.
 */
export function object<T extends Row>(
  shape: RowShape<T>,
  opts?: ObjectOpts,
): RowDomain<T> {
  const pickify: PickifyFunction = (val, sendErr) => {
    if (!checkKeys(val, shape, sendErr, opts)) {
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

  const build = arb.object<T>(shape).buildScript;

  return new RowDomain(pickify, build, shape);
}

/**
 * A domain that finds the first case where the given property matches, then
 * tries to match the rest of the value.
 */
export function taggedUnion<T extends Row>(
  tagProp: string,
  cases: RowDomain<T>[],
): Domain<T> {
  if (cases.length === 0) {
    throw new Error("taggedUnion requires at least one case");
  }

  const tagPatterns: Domain<unknown>[] = [];
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const pattern = c.shape[tagProp];
    if (!pattern) {
      throw new Error(`case ${i} doesn't have a '${tagProp}' property`);
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
