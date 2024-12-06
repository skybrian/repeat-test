import type { Row } from "../pickable.ts";
import type { RowShape } from "../domain_class.ts";

import type { ArbRow } from "../arbitraries/rows.ts";
import type { PickifyFunction, SendErr } from "@/core.ts";

import * as arb from "@/arbs.ts";
import { Domain } from "../domain_class.ts";
import { assert } from "@std/assert";

/**
 * Options for validating an object using {@link RowShape}.
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
 * A domain that searches for a shape that matches the given object.
 *
 * Shapes are tried in the order listed in the provided RowDomains, recursively
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
 * A RowPattern describes one possible object shape in a {@link RowDomain}.
 *
 * A RowPattern has *tags*, which are the properties that distinguish this case from others in the same union.
 */
export class RowPattern<T extends Row> {
  /**
   * Defines the Domain to use for validating or generating the value in each column.
   */
  readonly shape: RowShape<T>;

  /** The index of this case in the tagged union. */
  readonly index: number;
  /** The names of the properties to use for checking if this is the right case. */
  readonly tags: string[];

  /**
   * If true, no other properties are allowed (according to Object.keys).
   */
  readonly strict: boolean;

  /**
   * Picks rows for this case in the tagged union.
   */
  readonly arbRow: ArbRow<T>;

  /**
   * Creates a bare RowPattern.
   *
   * (RowPatterns are usually created as part of a {@link RowDomain}, via {@link object}.)
   */
  constructor(
    shape: RowShape<T>,
    opts: {
      index: number;
      tags: string[];
      weight: number;
      strict: boolean;
    },
  ) {
    this.shape = shape;
    this.index = opts.index;
    this.tags = opts.tags;
    this.strict = opts.strict;
    this.arbRow = arb.object(shape).with({ weight: opts.weight });
  }

  get weight(): number {
    return this.arbRow.buildScript.weight;
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
    if (this.strict) {
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

  with(opts: { index: number; tags: string[]; weight: number }): RowPattern<T> {
    return new RowPattern(
      this.shape,
      {
        index: opts.index,
        tags: opts.tags,
        weight: opts.weight,
        strict: this.strict,
      },
    );
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
  #arbRow: ArbRow<T>;

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

    const arbRow = arb.union(...patterns.map((c) => c.arbRow))
      .with({ name, weight });

    super(pickify, arbRow.buildScript);

    this.#tagProp = tagProp;
    this.#arbRow = arbRow;
  }

  get arbRow(): ArbRow<T> {
    return this.#arbRow;
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
    const pat = new RowPattern(shape, {
      index: 0,
      tags: [],
      weight: 1,
      strict: opts?.strict ?? false,
    });
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
      const weight = c.buildScript.weight;
      const childTotal = c.patterns.reduce((sum, pat) => sum + pat.weight, 0);
      assert(childTotal > 0, "child total must be positive");
      const adjustment = weight / childTotal;

      for (const pat of c.patterns) {
        let tags = pat.tags;
        if (!tags.includes(tagProp)) {
          if (!pat.shape[tagProp]) {
            throw new Error(
              `case ${pat.index} doesn't have a '${tagProp}' property`,
            );
          }
          tags = [...tags, tagProp];
        }
        const weight = pat.weight * adjustment;

        pats.push(pat.with({ index: pats.length, tags, weight }));
      }
    }

    return new RowDomain("taggedUnion", 1, tagProp, pats);
  }
}
