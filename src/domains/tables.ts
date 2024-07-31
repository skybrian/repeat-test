import Domain from "../domain_class.ts";
import * as arb from "../arbitraries.ts";
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
      const replies = item.maybePickify(v);
      if (!replies.ok) {
        const msg = replies.message ?? `unexpected item`;
        sendErr(`${i}: ${msg}`);
        return undefined;
      }
      const gen = item.parsePicks(replies.val);
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
