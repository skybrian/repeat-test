import type { Row, RowPicker } from "@/arbitrary.ts";
import type { PickifyFunction } from "@/domain.ts";

import * as arb from "@/arbs.ts";
import { Domain } from "@/domain.ts";
import { checkKeys } from "../options.ts";
import { assert } from "@std/assert/assert";

/**
 * Defines the acceptable values for some of the properties on an object.
 */
export type RowShape<T> = {
  [K in keyof T]: Domain<T[K]>;
};

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

  const rowPicker = arb.object(shape);

  const c: RowCase<T> = {
    shape,
    pickify,
    rowPicker,
  };

  return new RowDomain(pickify, rowPicker, [c]);
}

/**
 * A domain that finds the first case where the given property matches, then
 * tries to match the rest of the value.
 */
export function taggedUnion<T extends Row>(
  tagProp: keyof T & string,
  input: RowDomain<T>[],
): RowDomain<T> {
  if (input.length === 0) {
    throw new Error("taggedUnion requires at least one case");
  }

  const cases = input.map((c) => c.cases).flat();

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const pattern = c.shape[tagProp];
    if (!pattern) {
      throw new Error(`case ${i} doesn't have a '${tagProp}' property`);
    }
  }

  const pickify: PickifyFunction = (val, sendErr, name) => {
    if (val === null || typeof val !== "object") {
      sendErr("not an object", val);
      return undefined;
    }

    const allProps: { [key in string]?: unknown } = val;
    const actual = allProps[tagProp];
    if (typeof actual !== "string") {
      sendErr(`'${tagProp}' property is not a string`, val);
      return undefined;
    }
    const tags = { [tagProp]: actual };

    for (let i = 0; i < cases.length; i++) {
      const c = cases[i];
      if (propsMatch(c, tags)) {
        const picks = c.pickify(val, sendErr, "taggedUnion");
        if (picks === undefined) {
          return undefined; // rest of pattern didn't match
        }
        return [i, ...picks];
      }
    }
    sendErr(`${tagProp}: "${actual}" didn't match any case in '${name}'`, val);
  };

  const picker = arb.union(...cases.map((c) => c.rowPicker)).with({
    name: "taggedUnion",
  });

  return new RowDomain(pickify, picker, cases);
}

export type RowCase<T extends Row> = {
  readonly shape: RowShape<T>;
  readonly rowPicker: RowPicker<T>;
  readonly pickify: PickifyFunction;
};

/**
 * Returns true if each of the given properties matches the corresponding
 * domain.
 */
function propsMatch(c: RowCase<Row>, props: Row): boolean {
  return Object.entries(props).every(([key, val]) => {
    const domain = c.shape[key];
    assert(domain !== undefined);
    return domain.matches(val);
  });
}

export class RowDomain<T extends Row> extends Domain<T> {
  readonly #pickify: PickifyFunction;

  constructor(
    pickify: PickifyFunction,
    readonly rowPicker: RowPicker<T>,
    readonly cases: RowCase<T>[],
  ) {
    super(pickify, rowPicker.buildScript);
    this.#pickify = pickify;
  }

  override with(opts: { name: string }): RowDomain<T> {
    return new RowDomain(
      this.#pickify,
      this.rowPicker.with(opts),
      this.cases,
    );
  }
}
