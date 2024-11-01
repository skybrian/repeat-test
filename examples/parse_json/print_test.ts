import { describe, it } from "@std/testing/bdd";
import { schema } from "./schema.ts";
import { linesFromSchema } from "./print.ts";

import arbEntry from "./arbitrary_0.4.json" with { type: "json" };
import runnerEntry from "./runner_0.4.json" with { type: "json" };

import { assertEquals } from "@std/assert/equals";

describe("linesFromSchema", () => {
  it("prints the docs for for arbitrary entrypoint", () => {
    const parsed = schema.parse(arbEntry);
    const lines = Array.from(linesFromSchema(parsed)).join("\n");
    assertEquals(lines, expectedArbEntry);
  });
  it("prints the docs for for arbitrary entrypoint", () => {
    const parsed = schema.parse(runnerEntry);
    const lines = Array.from(linesFromSchema(parsed)).join("\n");
    assertEquals(lines, expectedRunnerEntry);
  });
});

const expectedArbEntry = `type PickRequestOpts = {
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

const expectedRunnerEntry = `repeatTest : (input, test, opts) => void

interface SystemConsole {
  log(?) : void
  error(?) : void
}

interface TestConsole {
  log(?) : void
  error(?) : void
  sometimes(key, val) : boolean
  debugger() : void
}

type Examples<T> = PickSet<T> | (array)

type RepeatOpts = {
  reps : number
  only : string
  console : SystemConsole
}

type TestFunction<T> = (arg, console) => void
`;
