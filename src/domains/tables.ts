import type { RowDomain, RowShape } from "./rows.ts";

import { assert } from "@std/assert";
import { Domain } from "@/domain.ts";
import * as arb from "@/arbs.ts";

import { PickTree } from "../pick_tree.ts";
import { checkArray, checkKeys, parseArrayOpts } from "../options.ts";
import { Gen } from "../gen_class.ts";

/**
 * Creates a Domain that accepts arrays where each item is different.
 *
 * Two items are considered equal if their canonical pick sequences are equal.
 */
export function uniqueArray<T>(
  item: Domain<T>,
  opts?: arb.ArrayOpts,
): Domain<T[]> {
  const generator = arb.uniqueArray(item, opts);
  const { min, max } = parseArrayOpts(opts);

  return Domain.make(generator, (val, sendErr) => {
    if (!checkArray(val, min, max, sendErr)) {
      return undefined;
    }

    const out: number[] = [];
    const seen = new PickTree();
    let i = 0;
    for (const v of val as T[]) {
      const replies = item.innerPickify(v, sendErr, i);
      if (replies === undefined) return undefined;

      // Regenerate because we need both requests and replies.
      const gen = Gen.build(item, replies);
      assert(gen.ok, "can't regenerate an accepted value");

      if (!seen.prune(gen)) {
        sendErr("duplicate item", v, { at: i });
        return undefined;
      }
      if (i >= min) {
        out.push(1);
      }
      out.push(...replies);
      i++;
    }
    if (i < max) {
      out.push(0);
    }
    return out;
  });
}

/**
 * Creates a Domain that accepts arrays of objects where every object has at
 * least the given properties.
 *
 * Properties whose names appear in {@link TableOpts.keys} will be constrained
 * to be unique columns. The comparison is done using their canonical pick
 * sequences.
 */
export function table<R extends Record<string, unknown>>(
  item: RowDomain<R>,
  opts?: arb.TableOpts<R>,
): Domain<R[]> {
  const shapes = item.cases.map((c) => c.shape);
  assert(shapes.length === 1, "not implemented");
  const shape: RowShape<R> = shapes[0];
  const keys = Object.keys(shape) as (keyof R & string)[];

  const uniqueKeys = opts?.keys ?? [];
  const { min, max } = parseArrayOpts(opts);
  const build = arb.table(arb.object(shape), opts);

  return Domain.make(build, (rows, sendErr) => {
    if (!checkArray(rows, min, max, sendErr)) {
      return undefined;
    }

    const trees: Record<string, PickTree> = {};
    for (const key of uniqueKeys) {
      trees[key] = new PickTree();
    }

    const out: number[] = [];
    let i = 0;
    for (const row of rows as Partial<Record<keyof R, unknown>>[]) {
      if (!checkKeys(row, shape, sendErr, { at: i })) {
        return undefined;
      }

      if (i >= min) {
        out.push(1);
      }
      for (const key of keys) {
        const propVal = row[key];
        const replies = shape[key].innerPickify(
          propVal,
          sendErr,
          `${i}.${key}`,
        );
        if (replies === undefined) return undefined;

        // Regenerate because we need both requests and replies.
        const gen = Gen.build(shape[key], replies);
        assert(gen.ok, "can't regenerate a previously accepted value");

        const seen = trees[key];
        if (seen) {
          if (!seen.prune(gen)) {
            sendErr("duplicate value found for unique key", propVal, {
              at: `${i}.${key}`,
            });
            return undefined;
          }
        }
        out.push(...replies);
      }
      i++;
    }
    if (i < max) {
      out.push(0);
    }
    return out;
  });
}
