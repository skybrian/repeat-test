import type { Range } from "../../src/picks.ts";
import type { Gen } from "../../src/gen_class.ts";

import { filtered } from "../../src/results.ts";
import { PickList } from "../../src/picks.ts";

export type GenProps<T> = {
  val: T;
  name: string;
  reqs: readonly Range[];
  replies: readonly number[];
};
export function propsFromGen<T>(gen: Gen<T>): GenProps<T>;
export function propsFromGen<T>(
  gen: Gen<T> | typeof filtered,
): GenProps<T> | typeof filtered;
export function propsFromGen<T>(
  gen: Gen<T> | typeof filtered,
): GenProps<T> | typeof filtered {
  if (gen === filtered) {
    return filtered;
  }

  const picks = PickList.copyFrom(gen);

  const out: GenProps<T> = {
    val: gen.val,
    name: gen.script.name,
    reqs: picks.reqs,
    replies: picks.replies,
  };
  return out;
}
