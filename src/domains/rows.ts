import type { Row, RowPicker } from "@/arbitrary.ts";
import type { PickifyFunction, SendErr } from "@/domain.ts";

import * as arb from "@/arbs.ts";
import { Domain } from "@/domain.ts";

/**
 * Defines which values are allowed for multiple properties on an object.
 *
 * Each property's allowed values are independent. Any other properties that the
 * object might have are unrestricted.
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
  return RowDomain.object(shape, opts);
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
  return RowDomain.taggedUnion(tagProp, cases);
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
    /** The index of this case in the tagged union. */
    readonly index: number,
    /** The names of the properties to use for checking if this is the right case. */
    readonly tags: string[],
    readonly shape: RowShape<T>,
    opts?: RowShapeOpts,
  ) {
    this.rowPicker = arb.object(shape);
    this.#opts = opts;
  }

  /**
   * Returns true if each of the row's tag properties match this pattern.
   *
   * (There might still be a mismatch due to the other properties.)
   */
  tagsMatch(row: Row): boolean {
    for (const tag of this.tags) {
      const val = row[tag];
      if (typeof val !== "string" || !this.shape[tag].matches(val)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Returns the picks for the given row, not including the case number.
   */
  pickify(val: Row, sendErr: SendErr) {
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
  }

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

    return new RowPattern(at, [...this.tags, name], this.shape, this.#opts);
  }
}

function checkIsRow(
  val: unknown,
  sendErr: SendErr,
  opts?: { at: number | string },
): val is Row {
  if (val === null || typeof val !== "object") {
    sendErr("not an object", val, opts);
    return false;
  }
  return true;
}

/**
 * A Domain that matches objects with one of more possible shapes.
 */
export class RowDomain<T extends Row> extends Domain<T> {
  #tagProp: string | undefined;

  private constructor(
    name: string,
    weight: number,
    tagProp: string | undefined,
    /** The possible shapes for objects in this domain. */
    readonly patterns: RowPattern<T>[],
  ) {
    const pickify: PickifyFunction = (val, sendErr) => {
      if (!checkIsRow(val, sendErr)) {
        return undefined;
      }

      const pat = this.findPattern(val, sendErr);
      if (pat === undefined) {
        return undefined;
      }

      const picks = pat.pickify(val, sendErr);
      if (picks === undefined) {
        return undefined;
      }
      return patterns.length > 1 ? [pat.index, ...picks] : picks;
    };

    const build =
      arb.union(...patterns.map((c) => c.rowPicker)).with({ name, weight })
        .buildScript;
    super(pickify, build);
    this.#tagProp = tagProp;
  }

  /**
   * Given a value, returns the first RowPattern that matches it.
   */
  findPattern(
    val: Row,
    sendErr: SendErr,
    opts?: { at: number | string },
  ): RowPattern<T> | undefined {
    if (this.#tagProp !== undefined && typeof val[this.#tagProp] !== "string") {
      sendErr(`'${this.#tagProp}' property is not a string`, val, opts);
      return undefined;
    }

    for (const pat of this.patterns) {
      if (pat.tagsMatch(val)) {
        return pat;
      }
    }

    const tags: Row = {};
    for (const pat of this.patterns) {
      for (const tag of pat.tags) {
        tags[tag] = val[tag];
      }
    }

    sendErr(`tags didn't match any case in '${this.name}'`, tags);
    return undefined;
  }

  /** Renames the domain. */
  override with(opts: { name?: string; weight?: number }): RowDomain<T> {
    const name = opts.name ?? this.name;
    const weight = opts.weight ?? this.buildScript.weight;
    return new RowDomain(name, weight, this.#tagProp, this.patterns);
  }

  /** Creates a RowDomain with a single case and no tag properties. */
  static object<T extends Row>(
    shape: RowShape<T>,
    opts?: RowShapeOpts,
  ): RowDomain<T> {
    const name = Object.keys(shape).length > 0 ? "object" : "empty object";
    const pat = new RowPattern(0, [], shape, opts);
    return new RowDomain(name, 1, undefined, [pat]);
  }

  /** Creates a RowDomain with the given tag property. */
  static taggedUnion<T extends Row>(
    tagProp: keyof T & string,
    cases: RowDomain<T>[],
  ): RowDomain<T> {
    if (cases.length === 0) {
      throw new Error("taggedUnion requires at least one case");
    }

    const pats: RowPattern<T>[] = [];
    for (const c of cases) {
      for (const pat of c.patterns) {
        pats.push(pat.withTag(tagProp, pats.length));
      }
    }

    return new RowDomain("taggedUnion", 1, tagProp, pats);
  }
}
