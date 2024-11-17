import type { Row, RowPicker } from "@/arbitrary.ts";
import type { PickifyFunction, SendErr } from "@/domain.ts";

import * as arb from "@/arbs.ts";
import { Domain } from "@/domain.ts";
import { checkKeys } from "../options.ts";

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

  const c: RowPattern<T> = {
    tags: [],
    shape,
    pickify,
    rowPicker,
  };

  return new RowDomain(pickify, rowPicker, [c], () => 0);
}

/**
 * A domain that finds the first case where all tag properties match, then tries
 * to match that case against the rest of the object.
 *
 * (There can be more than one tag property when taggedUnions are nested.)
 *
 * Compared to `dom.firstOf`, matching against tags results in better error
 * messages when the tags match, but the rest of the selected case doesn't.
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

  if (cases.length === 1) {
    return input[0]; // pick format doesn't begin with a case number
  }

  const taggedCases = cases.map((c) => {
    const tags = c.tags.includes(tagProp) ? c.tags : [...c.tags, tagProp];
    return {
      tags,
      shape: c.shape,
      pickify: c.pickify,
      rowPicker: c.rowPicker,
    };
  });

  function findPatternIndex(
    val: unknown,
    sendErr: SendErr,
    opts?: { at: number | string },
  ): number | undefined {
    if (val === null || typeof val !== "object") {
      sendErr("not an object", val, opts);
      return undefined;
    }
    const row = val as Row;
    if (typeof row[tagProp] !== "string") {
      sendErr(`'${tagProp}' property is not a string`, row, opts);
      return undefined;
    }

    for (let i = 0; i < taggedCases.length; i++) {
      const c = taggedCases[i];
      if (tagsMatch(c, row)) {
        return i;
      }
    }
    return undefined;
  }

  const pickify: PickifyFunction = (val, sendErr, name) => {
    const index = findPatternIndex(val, sendErr);
    if (index === undefined) {
      sendErr(
        `tags didn't match any case in '${name}'`,
        val,
      );
      return undefined;
    }

    const pat = taggedCases[index];
    const picks = pat.pickify(val, sendErr, "taggedUnion");
    if (picks === undefined) {
      return undefined;
    }
    return [index, ...picks];
  };

  const picker = arb.union(...cases.map((c) => c.rowPicker)).with({
    name: "taggedUnion",
  });

  return new RowDomain(pickify, picker, taggedCases, findPatternIndex);
}

export type RowPattern<T extends Row> = {
  /** The names of the properties to check first to see if there's a match. */
  readonly tags: string[];

  readonly shape: RowShape<T>;
  readonly pickify: PickifyFunction;

  readonly rowPicker: RowPicker<T>;
};

/**
 * Returns true if each of the given properties matches the corresponding
 * domain.
 */
function tagsMatch(pat: RowPattern<Row>, row: Row): boolean {
  for (const tag of pat.tags) {
    const val = row[tag];
    if (typeof val !== "string" || !pat.shape[tag].matches(val)) {
      return false;
    }
  }
  return true;
}

export class RowDomain<T extends Row> extends Domain<T> {
  readonly #pickify: PickifyFunction;

  constructor(
    pickify: PickifyFunction,
    readonly rowPicker: RowPicker<T>,
    readonly cases: RowPattern<T>[],
    readonly findPatternIndex: (
      val: unknown,
      sendErr: SendErr,
      opts?: { at: number | string },
    ) => number | undefined,
  ) {
    super(pickify, rowPicker.buildScript);
    this.#pickify = pickify;
  }

  override with(opts: { name: string }): RowDomain<T> {
    return new RowDomain(
      this.#pickify,
      this.rowPicker.with(opts),
      this.cases,
      this.findPatternIndex,
    );
  }
}
