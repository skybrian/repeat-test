import type { Row } from "../entrypoints/core.ts";
import type { RowDomain } from "./rows.ts";

import { assert } from "@std/assert";
import { Domain, type SendErr } from "@/core.ts";
import * as arb from "@/arbs.ts";

import { PickTree } from "../pick_tree.ts";
import { checkArray, parseArrayOpts } from "../options.ts";
import { Gen } from "../gen_class.ts";
import { type KeyShape, parseKeyOpts } from "../arbitraries/tables.ts";

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
  const keyShape = parseKeyOpts(item.arbRow, opts);

  const buildRow = arb.union(...item.patterns.map((c) => c.arbRow));
  const build = arb.table(buildRow, opts);

  function pickifyTable(rows: unknown, sendErr: SendErr) {
    if (!checkArray(rows, min, max, sendErr)) {
      return undefined;
    }

    const out = new TableWriter(item, keyShape, sendErr);

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
  if (val === null || typeof val !== "object") {
    out.sendErr("not an object", val, { at: out.rowCount });
    return false;
  }
  const row = val as Row;

  const pat = out.item.findPattern(row, out.sendErr, { at: out.rowCount });
  if (pat === undefined) {
    return false;
  }

  if (out.item.patterns.length > 1) {
    out.buf.push(pat.index);
  }

  let rowAt = `${out.rowCount}`;
  const keyCol = out.keyColumnName;
  if (keyCol !== undefined) {
    const val = row[keyCol];
    if (pat.shape[keyCol].matches(val)) {
      rowAt = `[${keyCol}=${val}]`;
    }
  }

  function serializeField(colName: string, dom: Domain<unknown>): boolean {
    const propVal = row[colName];
    const replies = dom.innerPickify(
      propVal,
      out.sendErr,
      `${rowAt}.${colName}`,
    );
    if (replies === undefined) {
      return false;
    }
    if (!fieldAdded(colName, propVal, replies, out)) {
      return false;
    }
    out.buf.push(...replies);
    return true;
  }

  // Serialize keys first.

  const keyColNames = Object.keys(out.keyShape);
  const nonKeyColNames = Object.keys(pat.shape).filter((k) => !out.keyShape[k]);
  const colNames = [...keyColNames, ...nonKeyColNames];

  for (const colName of colNames) {
    if (!serializeField(colName, pat.shape[colName])) {
      return false;
    }
  }
  return true;
}

function fieldAdded<R extends Row>(
  key: string,
  val: unknown,
  replies: Iterable<number>,
  out: TableWriter<R>,
): boolean {
  const seen = out.columnTrees[key];
  if (!seen) {
    return true; // not a unique key
  }
  const colDom = out.columnDoms[key];

  // Regenerate because we need both requests and replies.
  const gen = Gen.build(colDom, replies);
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
  columnDoms: Record<string, Domain<unknown>> = {};
  keyColumnName: string | undefined = undefined;
  rowCount = 0;
  readonly buf: number[] = [];

  constructor(
    readonly item: RowDomain<R>,
    readonly keyShape: KeyShape<R>,
    readonly sendErr: SendErr,
  ) {
    for (const [key, dom] of Object.entries(keyShape)) {
      assert(dom instanceof Domain);
      if (this.keyColumnName === undefined) {
        this.keyColumnName = key;
      }
      this.columnTrees[key] = new PickTree();
      this.columnDoms[key] = dom;
    }
  }
}
