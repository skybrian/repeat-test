import type { Gen } from "../../src/gen_class.ts";
import type { Range } from "../../src/picks.ts";
import { filtered } from "../../src/results.ts";

export type GenProps<T> = {
  val: T;
  name: string;
  reqs: Range[];
  replies: number[];
};

export function propsFromGen<T>(
  gen: Gen<T> | typeof filtered,
): GenProps<T> | typeof filtered {
  if (gen === filtered) {
    return filtered;
  }
  const picks = gen.picks;
  const out: GenProps<T> = {
    val: gen.val,
    name: gen.name,
    reqs: picks.reqs,
    replies: picks.replies,
  };
  return out;
}
