import type { AnyRecord } from "../types.ts";
import { Domain } from "../domain_class.ts";
import * as arb from "../arbitraries.ts";
import type * as dom from "./basics.ts";
import { PickTree } from "../pick_tree.ts";
import { assert } from "@std/assert";
import { PickList } from "../picks.ts";

export function uniqueArray<T>(
  item: Domain<T>,
  opts?: { label?: string },
): Domain<T[]> {
  const generator = arb.uniqueArray(item, opts);

  return new Domain(generator, (val, sendErr) => {
    if (!Array.isArray(val)) {
      sendErr("not an array");
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

      const picks = PickList.zip(gen.reqs, gen.replies);
      if (!seen.prune(picks)) {
        sendErr("duplicate item", { at: i });
        return undefined;
      }
      out.push(1);
      out.push(...picks.replies());
      i++;
    }
    out.push(0);
    return out;
  });
}

export function table<R extends AnyRecord>(
  shape: dom.RecordShape<R>,
  opts?: arb.TableOpts<R>,
): Domain<R[]> {
  const keys = Object.keys(shape) as (keyof R & string)[];
  const uniqueKeys = opts?.uniqueKeys ?? [];
  const generator = arb.table(shape, opts);

  return new Domain(generator, (rows, sendErr) => {
    if (!Array.isArray(rows)) {
      sendErr("not an array");
      return undefined;
    }

    const trees: Record<string, PickTree> = {};
    for (const key of uniqueKeys) {
      trees[key] = new PickTree();
    }

    const out: number[] = [];
    let i = 0;
    for (const row of rows as Partial<Record<keyof R, unknown>>[]) {
      if (typeof row !== "object" || row === null) {
        sendErr("not a record", { at: i });
        return undefined;
      }
      for (const key of Object.keys(row)) {
        if (!keys.includes(key)) {
          sendErr(`extra field: ${key}`, { at: i });
          return undefined;
        }
      }

      out.push(1);
      for (const key of keys) {
        const field = row[key];
        const replies = shape[key].innerPickify(field, sendErr, `${i}.${key}`);
        if (replies === undefined) return undefined;

        // Regenerate because we need both requests and replies.
        const gen = shape[key].generate(replies);
        assert(gen.ok, "can't regenerate an accepted value");
        const picks = PickList.zip(gen.reqs, gen.replies);

        const seen = trees[key];
        if (seen) {
          if (!seen.prune(picks)) {
            sendErr("duplicate field value", { at: `${i}.${key}` });
            return undefined;
          }
        }
        out.push(...picks.replies());
      }
      i++;
    }
    out.push(0);
    return out;
  });
}
