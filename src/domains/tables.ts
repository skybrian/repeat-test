import type { RowDomain, RowShape } from "./rows.ts";

import { assert } from "@std/assert";
import { Domain, type SendErr } from "@/domain.ts";
import * as arb from "@/arbs.ts";

import { PickTree } from "../pick_tree.ts";
import { checkArray, parseArrayOpts } from "../options.ts";
import { Gen } from "../gen_class.ts";
import type { Row } from "@/arbitrary.ts";

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
  const { min, max } = parseArrayOpts(opts);
  const build = arb.table(item.rowPicker, opts);

  const uniqueKeys = opts?.keys ?? [];

  const shapes = item.cases.map((c) => c.shape);
  const first = shapes[0];
  for (const key of uniqueKeys) {
    if (!first[key]) {
      throw new Error(`unique key ${key} not defined`);
    }
  }
  for (let i = 1; i < shapes.length; i++) {
    for (const key of uniqueKeys) {
      if (first[key] !== shapes[i][key]) {
        throw new Error(
          `unique key ${key} not defined the same way in each case`,
        );
      }
    }
  }

  function pickifyTable(rows: unknown, sendErr: SendErr) {
    if (!checkArray(rows, min, max, sendErr)) {
      return undefined;
    }

    const out = new TableWriter(item, uniqueKeys, sendErr);

    for (const row of rows as unknown[]) {
      if (out.rowCount >= min) {
        out.buf.push(1);
      }
      if (!pickifyRow(row, out)) {
        return undefined;
      }
      out.rowCount++;
    }

    if (out.rowCount < max) {
      out.buf.push(0);
    }
    return out.buf;
  }

  return Domain.make(build, pickifyTable);
}

function pickifyRow<R extends Row>(
  val: unknown,
  out: TableWriter<R>,
): boolean {
  const shapes = out.item.cases.map((c) => c.shape);
  assert(shapes.length === 1, "not implemented");
  const shape: RowShape<R> = shapes[0];

  if (val === null || typeof val !== "object") {
    out.sendErr("not an object", val, { at: out.rowCount });
    return false;
  }
  const row = val as Row;

  const keys = Object.keys(shape) as (keyof R & string)[];
  for (const key of keys) {
    const propVal = row[key];
    const replies = shape[key].innerPickify(
      propVal,
      out.sendErr,
      `${out.rowCount}.${key}`,
    );
    if (replies === undefined) return false;

    if (!fieldAdded(shape, key, propVal, replies, out)) {
      return false;
    }

    out.buf.push(...replies);
  }
  return true;
}

function fieldAdded<R extends Row>(
  shape: RowShape<R>,
  key: string,
  val: unknown,
  replies: Iterable<number>,
  out: TableWriter<R>,
): boolean {
  const seen = out.columnTrees[key];
  if (!seen) {
    return true; // not a unique key
  }

  // Regenerate because we need both requests and replies.
  const gen = Gen.build(shape[key], replies);
  assert(gen.ok, "can't regenerate a previously accepted value");

  if (!seen.prune(gen)) {
    const at = `${out.rowCount}.${key}`;
    out.sendErr("duplicate value found for unique key", val, { at });
    return false;
  }
  return true;
}

class TableWriter<R extends Row> {
  columnTrees: Record<string, PickTree> = {};
  rowCount = 0;
  readonly buf: number[] = [];

  constructor(
    readonly item: RowDomain<R>,
    readonly uniqueKeys: string[],
    readonly sendErr: SendErr,
  ) {
    for (const key of uniqueKeys) {
      this.columnTrees[key] = new PickTree();
    }
  }
}
