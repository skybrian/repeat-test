import { describe, it } from "@std/testing/bdd";
import { schema } from "./schema.ts";
import { linesFromSchema } from "./print.ts";

import denoDocOutput from "./arbitrary_0.4.json" with { type: "json" };
import { assertEquals } from "@std/assert/equals";

const expected = `type PickRequestOpts = {
  bias : RandomPicker
}

type RandomPicker = (source) => number

type RandomSource = () => number

type Generated<T> = {
  ok : (literal)
  reqs : (array)
  replies : (array)
  val : T
}

type IntPickerMiddleware = (req, next) => number

type PickCallback<T> = (pick) => T

interface PickFunction {
  (req) => number
  (req, opts) => T
}

type PickFunctionOpts<T> = {
  middle : () => IntPickerMiddleware
  accept : (val) => boolean
  maxTries : number
}

interface PickSet<T> {
  label: string
  generateFrom: PickCallback<T>
}

type RecordShape<T> = [K ...]: PickSet<...>

biasedBitRequest : (probOne) => PickRequest

class PickRequest {
  constructor(min, max, opts)
  random: RandomPicker
  inRange(n) : boolean
  size() : number
  toString() : string
}

class Arbitrary<T> {
  constructor(arb)
  constructor(callback, label, opts)
  constructor(arg, label, opts)
  label() : string
  generateFrom() : PickCallback<T>
  maxSize() : number | undefined
  map(convert) : Arbitrary<U>
  filter(accept) : Arbitrary<T>
  chain(convert) : Arbitrary<U>
  with(opts) : Arbitrary<T>
  asFunction() : () => Arbitrary<T>
  toString() : string
  from(req) : Arbitrary<number>
  from(callback) : Arbitrary<T>
  from(arg) : Arbitrary<T> | Arbitrary<number>
  of(?) : Arbitrary<T>
  oneOf(?) : Arbitrary<T>
  record(shape) : Arbitrary<T>
}
`;

describe("linesFromSchema", () => {
  it("converts the schema to the lines to print", () => {
    const parsed = schema.parse(denoDocOutput);
    const lines = Array.from(linesFromSchema(parsed)).join("\n");
    assertEquals(lines, expected);
  });
});
