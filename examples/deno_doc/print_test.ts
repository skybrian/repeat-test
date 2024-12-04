import { describe, it } from "@std/testing/bdd";
import { denoDoc, makeDenoDocSchema, type Node } from "./schema.ts";
import { linesFromDenoDoc } from "./print.ts";

import arbEntry from "./data/arbitrary_0.4.json" with { type: "json" };
import runnerEntry from "./data/runner_0.4.json" with { type: "json" };

import { assertEquals } from "@std/assert/equals";
import { dom, repeatTest } from "@/mod.ts";
import { assertThrows } from "@std/assert";

describe("linesFromDenoDoc", () => {
  it("generates expected docs for for the 'arbitrary' entrypoint", () => {
    const parsed = denoDoc.parse(arbEntry);
    const lines = Array.from(linesFromDenoDoc(parsed)).join("\n");
    assertEquals(lines, expectedArbEntry);
  });

  it("generates expected docs for the 'runner' entrypoint", () => {
    const parsed = denoDoc.parse(runnerEntry);
    const lines = Array.from(linesFromDenoDoc(parsed)).join("\n");
    assertEquals(lines, expectedRunnerEntry);
  });

  it("doesn't fail for arbitrary DenoDoc", () => {
    const example = makeDenoDocSchema({
      typeName: dom.of("Foo", "Bar", "Baz", "Quux"),
      typeParamName: dom.of("T", "A", "B", "C"),
      valName: dom.asciiChar(/[a-z]/),
      text: dom.of("some text"),
      maxItems: 10,
    });
    repeatTest(example, (s) => {
      for (const _line of linesFromDenoDoc(s)) {
        // console.log(_line);
      }
    }, { reps: 100, maxPicks: 1000 });
  });

  it("throws an exception when given an invalid node kind", () => {
    const invalidNode = {
      kind: "invalid",
    } as unknown as Node;
    const lines = linesFromDenoDoc({ version: 1, nodes: [invalidNode] });
    assertThrows(() => Array.from(lines), Error, "unknown node kind");
  });
});

const expectedArbEntry = `type PickRequestOpts = {
  bias : RandomPicker
}

type RandomPicker = (source) => number

type RandomSource = () => number

type Generated<T> = {
  ok : true
  reqs : PickRequest[]
  replies : number[]
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
  label : string
  generateFrom : PickCallback<T>
}

type RecordShape<T> = [K ...]: PickSet<T[K]>

function biasedBitRequest(probOne) : PickRequest

class PickRequest {
  constructor(min, max, opts)
  random : RandomPicker
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
  of(...examples) : Arbitrary<T>
  oneOf(...cases) : Arbitrary<T>
  record(shape) : Arbitrary<T>
}
`;

const expectedRunnerEntry = `function repeatTest(input, test, opts) : void

interface SystemConsole {
  log(...data) : void
  error(...data) : void
}

interface TestConsole {
  log(...data) : void
  error(...data) : void
  sometimes(key, val) : boolean
  debugger() : void
}

type Examples<T> = PickSet<T> | (T | Arbitrary<T>)[]

type RepeatOpts = {
  reps : number
  only : string
  console : SystemConsole
}

type TestFunction<T> = (arg, console) => void
`;
