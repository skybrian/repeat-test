import type { Row, RowPicker } from "@/arbitrary.ts";
import type { PickifyFunction, SendErr } from "@/domain.ts";

import * as arb from "@/arbs.ts";
import { Domain } from "@/domain.ts";

/**
 * Defines acceptable values for some properties on an object.
 */
export type RowShape<T> = {
  [K in keyof T]: Domain<T[K]>;
};

/**
 * Options for validating an object using a {@link RowShape}.
 */
export type RowShapeOpts = {
  /**
   * If set, the Object.keys() list for an object will only be allowed to have
   * the keys given by the {@link RowShape}.
   */
  strict?: boolean;
};

/**
 * A domain that matches an object with the given shape.
 *
 * After being parsed or regenerated, the copy will only have the properties
 * listed by the {@link RowShape}. The prototype of the copy will be
 * `Object.prototype`.
 */
export function object<T extends Row>(
  shape: RowShape<T>,
  opts?: RowShapeOpts,
): RowDomain<T> {
  const pat = new RowPattern([], shape, opts);
  return RowDomain.object(pat);
}

/**
 * A domain that searches for a {@link RowShape} that matches the given object.
 *
 * Shapes are tried in the order listed in the provided RowDomain, recursively
 * when taggedUnions are nested. The first shape that matches on all its tag
 * properties will be used. (There can be more than one tag property when
 * taggedUnions are nested.)
 *
 * This is similar to how `dom.firstOf` works, but stopping when the tags match
 * often results in better error messages when validation fails. Also, a
 * taggedUnion can be used in a table.
 */
export function taggedUnion<T extends Row>(
  tagProp: keyof T & string,
  cases: RowDomain<T>[],
): RowDomain<T> {
  if (cases.length === 0) {
    throw new Error("taggedUnion requires at least one case");
  }

  const pats: RowPattern<T>[] = [];
  for (const c of cases) {
    for (const pat of c.pats) {
      pats.push(pat.withTag(tagProp, pats.length));
    }
  }

  return RowDomain.union(tagProp, pats);
}

/**
 * A RowPattern describes one object shape in a tagged union.
 *
 * A RowPattern has *tags*, which are the properties that distinguish this case from others in the same union.
 */
export class RowPattern<T extends Row> {
  readonly rowPicker: RowPicker<T>;
  #opts?: RowShapeOpts;

  constructor(
    /** The names of the properties to use for checking if this is the right case. */
    readonly tags: string[],
    readonly shape: RowShape<T>,
    opts?: RowShapeOpts,
  ) {
    this.rowPicker = arb.object(shape);
    this.#opts = opts;
  }

  /**
   * Returns the picks for the given object, not including the case number.
   */
  readonly pickify: PickifyFunction = (val, sendErr) => {
    if (val === null || typeof val !== "object") {
      sendErr("not an object", val);
      return undefined;
    }

    if (this.#opts?.strict) {
      for (const key of Object.keys(val)) {
        if (!(key in this.shape)) {
          sendErr(`extra property: ${key}`, val);
          return undefined;
        }
      }
    }

    const out: number[] = [];
    for (const key of Object.keys(this.shape)) {
      const propVal = val[key as keyof typeof val];
      const picks = this.shape[key].innerPickify(propVal, sendErr, key);
      if (picks === undefined) return undefined;
      out.push(...picks);
    }
    return out;
  };

  /**
   * Marks the property with the given name as a tag that distinguishes this
   * case from others.
   *
   * @param at The index of the case in the new union.
   */
  withTag(name: string, at: number) {
    if (this.tags.includes(name)) {
      return this;
    }

    if (!this.shape[name]) {
      throw new Error(`case ${at} doesn't have a '${name}' property`);
    }

    return new RowPattern([...this.tags, name], this.shape, this.#opts);
  }
}

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

  private constructor(
    readonly rowPicker: RowPicker<T>,
    readonly pats: RowPattern<T>[],
    readonly findPatternIndex: (
      val: unknown,
      sendErr: SendErr,
      opts?: { at: number | string },
    ) => number | undefined,
  ) {
    const pickify: PickifyFunction = (val, sendErr, name) => {
      const index = findPatternIndex(val, sendErr);
      if (index === undefined) {
        sendErr(
          `tags didn't match any case in '${name}'`,
          val,
        );
        return undefined;
      }

      const pat = pats[index];
      const picks = pat.pickify(val, sendErr, name);
      if (picks === undefined) {
        return undefined;
      }
      return pats.length > 1 ? [index, ...picks] : picks;
    };

    super(pickify, rowPicker.buildScript);
    this.#pickify = pickify;
  }

  override with(opts: { name: string }): RowDomain<T> {
    return new RowDomain(
      this.rowPicker.with(opts),
      this.pats,
      this.findPatternIndex,
    );
  }

  static object<T extends Row>(
    pat: RowPattern<T>,
  ): RowDomain<T> {
    return new RowDomain(pat.rowPicker, [pat], () => 0);
  }

  static union<T extends Row>(
    tagProp: string,
    pats: RowPattern<T>[],
  ): RowDomain<T> {
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

      for (let i = 0; i < pats.length; i++) {
        if (tagsMatch(pats[i], row)) {
          return i;
        }
      }
      return undefined;
    }

    const picker = arb.union(...pats.map((c) => c.rowPicker)).with({
      name: "taggedUnion",
    });

    return new RowDomain(picker, pats, findPatternIndex);
  }
}
