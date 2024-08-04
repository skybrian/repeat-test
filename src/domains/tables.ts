import { AnyRecord } from "../types.ts";
import Domain from "../domain_class.ts";
import * as arb from "../arbitraries.ts";
import * as dom from "./basics.ts";
import { PickTree } from "../searches.ts";

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
      const gen = item.parsePicks(replies);
      const picks = gen.picks();
      if (!seen.prune(picks)) {
        sendErr(`${i}: duplicate item`);
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
        sendErr(`${i}: not a record`);
        return undefined;
      }
      for (const key of Object.keys(row)) {
        if (!keys.includes(key)) {
          sendErr(`${i}: extra field: ${key}`);
          return undefined;
        }
      }

      out.push(1);
      for (const key of keys) {
        const field = row[key];
        const replies = shape[key].innerPickify(field, sendErr, `${i}.${key}`);
        if (replies === undefined) return undefined;
        const gen = shape[key].parsePicks(replies);
        const picks = gen.picks();

        const seen = trees[key];
        if (seen) {
          if (!seen.prune(picks)) {
            sendErr(`${i}.${key}: duplicate field value`);
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
