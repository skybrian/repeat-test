import { assert } from "@std/assert";
import { Domain } from "@/domain.ts";
import * as arb from "@/arbs.ts";

import type * as dom from "./basics.ts";
import { PickTree } from "../pick_tree.ts";
import { checkArray, checkRecordKeys, parseArrayOpts } from "../options.ts";

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
      const gen = item.generate(replies);
      assert(gen.ok, "can't regenerate an accepted value");

      if (!seen.prune(gen)) {
        sendErr("duplicate item", { at: i });
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
 * Creates a Domain that accepts arrays of records, where every record has a
 * given shape.
 *
 * Fields whose names appear in {@link TableOpts.keys} will be constrained to be
 * unique columns. The comparison is done using their canonical pick sequences
 */
export function table<R extends Record<string, unknown>>(
  shape: dom.RecordShape<R>,
  opts?: arb.TableOpts<R>,
): Domain<R[]> {
  const keys = Object.keys(shape) as (keyof R & string)[];
  const uniqueKeys = opts?.keys ?? [];
  const { min, max } = parseArrayOpts(opts);
  const generator = arb.table(shape, opts);

  return Domain.make(generator, (rows, sendErr) => {
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
      if (!checkRecordKeys(row, shape, sendErr, { at: i })) {
        return undefined;
      }

      if (i >= min) {
        out.push(1);
      }
      for (const key of keys) {
        const field = row[key];
        const replies = shape[key].innerPickify(field, sendErr, `${i}.${key}`);
        if (replies === undefined) return undefined;

        // Regenerate because we need both requests and replies.
        const gen = shape[key].generate(replies);
        assert(gen.ok, "can't regenerate an accepted value");

        const seen = trees[key];
        if (seen) {
          if (!seen.prune(gen)) {
            sendErr("duplicate field value", { at: `${i}.${key}` });
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
