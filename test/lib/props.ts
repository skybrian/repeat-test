import { assert } from "@std/assert/assert";
import type { Gen } from "../../src/gen_class.ts";
import type { Range } from "../../src/picks.ts";

export type GenProps<T> = {
  val: T;
  name: string;
  reqs: Range[];
  replies: number[];
};

export function propsFromGen<T>(
  gen: Gen<T> | undefined,
): GenProps<T> | undefined {
  assert(gen !== undefined, "gen is undefined");
  const picks = gen.picks;
  const out: GenProps<T> = {
    val: gen.val,
    name: gen.name,
    reqs: picks.reqs,
    replies: picks.replies,
  };
  return out;
}
