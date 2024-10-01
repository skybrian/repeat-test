import { assert } from "@std/assert/assert";
import type { Gen } from "../../src/gen_class.ts";
import type { PickRequest } from "../../src/picks.ts";

export type GenProps<T> = {
  val: T;
  label: string;
  reqs: PickRequest[];
  replies: number[];
};

export function propsFromGen<T>(
  gen: Gen<T> | undefined,
): GenProps<T> | undefined {
  assert(gen !== undefined);
  const picks = gen.picks;
  const out: GenProps<T> = {
    val: gen.val,
    label: gen.label,
    reqs: picks.reqs,
    replies: picks.replies,
  };
  return out;
}
