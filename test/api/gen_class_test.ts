import {
  deepStrictEqual,
  notStrictEqual,
  ok,
  strictEqual,
  throws,
} from "node:assert/strict";
import { describe, it } from "node:test";
import { frozen } from "@skybrian/repeat-test";
import {
  Filtered,
  Gen,
  IntRequest,
  type PickSink,
  Script,
} from "@skybrian/repeat-test/core";

const bit = Script.make("bit", (pick) => pick(IntRequest.bit));
const rollReq = new IntRequest(1, 6);
const roll = Script.make("roll", (pick) => pick(rollReq));
const twoBits = Script.make("twoBits", (pick) => {
  const a = pick(IntRequest.bit);
  const b = pick(IntRequest.bit);
  return `(${a}, ${b})`;
}, { logCalls: true });

const rejectAll = Script.make("neverReturns", () => {
  throw new Filtered("nope");
});
const notOne = Script.make(
  "filtered",
  (pick) => pick(roll, { accept: (value) => value !== 1 }),
);
const firstPickFiltered = Script.make("firstPickFiltered", (pick) => {
  const a = pick(rejectAll);
  const b = pick(IntRequest.bit);
  return `(${a}, ${b})`;
});

const failures: {
  name: string;
  script: Script<unknown>;
  replies: number[];
  message: string;
}[] = [
  {
    name: "missing picks",
    script: bit,
    replies: [],
    message: "can't build 'bit': ran out of picks",
  },
  {
    name: "a script that always filters",
    script: rejectAll,
    replies: [],
    message: "can't build 'neverReturns': picks not accepted",
  },
  {
    name: "excess picks",
    script: bit,
    replies: [1, 1],
    message: "can't build 'bit': read only 1 of 2 available picks",
  },
  {
    name: "an out-of-range pick",
    script: roll,
    replies: [7],
    message:
      "can't build 'roll': pick 0 didn't satisfy the request. Want: [1, 6]. Got: 7",
  },
  {
    name: "a filtered pick",
    script: notOne,
    replies: [1],
    message: "can't build 'filtered': picks not accepted",
  },
  {
    name: "a filtered pick with excess replies",
    script: notOne,
    replies: [1, 2],
    message: "can't build 'filtered': read only 1 of 2 available picks",
  },
  {
    name: "missing picks with logCalls enabled",
    script: twoBits,
    replies: [],
    message: "can't build 'twoBits': ran out of picks",
  },
  {
    name: "a first pick that throws Filtered without reading a reply",
    script: firstPickFiltered,
    replies: [0],
    message:
      "can't build 'firstPickFiltered': read only 0 of 1 available picks",
  },
];

describe("Gen", () => {
  describe("build", () => {
    it("returns a successful Gen for a constant without picks", () => {
      const hello = Script.make("hello", () => "hi");
      const gen = Gen.build(hello, []);
      ok(gen.ok);
      ok(gen instanceof Gen);
      strictEqual(gen.sourceName, "hello");
      strictEqual(gen.val, "hi");
      deepStrictEqual([...gen.replies], []);
    });

    for (const { name, script, replies, message } of failures) {
      it(`returns a failure for ${name}`, () => {
        deepStrictEqual(Gen.build(script, replies), {
          ok: false,
          message,
          actual: replies,
        });
      });
    }
  });

  describe("mustBuild", () => {
    it("exposes the source name, success flag, value, and ordered replies", () => {
      for (const replies of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const gen = Gen.mustBuild(twoBits, replies);
        strictEqual(gen.ok, true);
        strictEqual(gen.sourceName, "twoBits");
        strictEqual(gen.val, `(${replies[0]}, ${replies[1]})`);
        deepStrictEqual([...gen.replies], replies);
        // Reading the replies must not consume them.
        deepStrictEqual([...gen.replies], replies);
      }
    });

    for (const { name, script, replies, message } of failures) {
      it(`throws an Error for ${name}`, () => {
        throws(() => Gen.mustBuild(script, replies), (error: unknown) => {
          ok(error instanceof Error);
          strictEqual(error.constructor, Error);
          strictEqual(error.message, message);
          return true;
        });
      });
    }
  });

  for (const method of ["build", "mustBuild"] as const) {
    for (const logCalls of [false, true]) {
      it(`${method} propagates non-Filtered errors (logCalls: ${logCalls})`, () => {
        const error = new TypeError("oops!");
        const fails = Script.make("fails", (pick) => {
          pick(IntRequest.bit);
          throw error;
        }, { logCalls });
        throws(() => Gen[method](fails, [1]), (actual: unknown) => {
          strictEqual(actual, error);
          return true;
        });
      });
    }
  }

  describe("val", () => {
    const frozenScript = Script.make("frozen", () => frozen(["frozen"]));
    const mutable = Script.make("mutable", () => ["mutable"]);

    it("returns the same frozen value on repeated accesses", () => {
      const gen = Gen.mustBuild(frozenScript, []);
      const first = gen.val;
      deepStrictEqual(first, ["frozen"]);
      strictEqual(Object.isFrozen(first), true);
      strictEqual(gen.val, first);
    });

    it("isolates mutable values across accesses, including mutations", () => {
      const gen = Gen.mustBuild(mutable, []);
      const first = gen.val;
      deepStrictEqual(first, ["mutable"]);
      first.push("changed");
      const second = gen.val;
      notStrictEqual(second, first);
      deepStrictEqual(second, ["mutable"]);
      second[0] = "changed again";
      const third = gen.val;
      notStrictEqual(third, first);
      notStrictEqual(third, second);
      deepStrictEqual(third, ["mutable"]);
    });

    it("isolates values when picking from a mutable script", () => {
      const usesMutable = Script.make("usesMutable", (pick) => {
        const a = pick(mutable);
        return [a[0] + "!"];
      }, { logCalls: true });
      const gen = Gen.mustBuild(usesMutable, []);
      const first = gen.val;
      deepStrictEqual(first, ["mutable!"]);
      first[0] = "changed";
      const second = gen.val;
      notStrictEqual(second, first);
      deepStrictEqual(second, ["mutable!"]);
      second.push("changed again");
      deepStrictEqual(gen.val, ["mutable!"]);
    });

    it("isolates mutable results built from frozen picks and explicit replies", () => {
      const uncached = Script.make("uncached", (pick) => {
        const value = pick(frozenScript);
        return value.concat(["" + pick(IntRequest.bit)]);
      }, { logCalls: true });
      const gen = Gen.mustBuild(uncached, [1]);
      const first = gen.val;
      deepStrictEqual(first, ["frozen", "1"]);
      const second = gen.val;
      notStrictEqual(second, first);
      deepStrictEqual(second, first);
      first[0] = "changed";
      second.push("changed again");
      deepStrictEqual(gen.val, ["frozen", "1"]);
      deepStrictEqual([...gen.replies], [1]);
    });
  });

  describe("pushTo", () => {
    const lastReq = new IntRequest(2, 3);
    const nested = Script.make("nested", (pick) => [
      pick(roll),
      pick(IntRequest.bit),
      pick(lastReq),
    ], { logCalls: true });
    const expected = [[1, 6, 4], [0, 1, 1], [2, 3, 2]];

    it("sends only integer requests and replies, in order, to an accepting sink", () => {
      const gen = Gen.mustBuild(nested, [4, 1, 2]);
      const received: number[][] = [];
      const sink: PickSink = {
        push(req, reply) {
          received.push([req.min, req.max, reply]);
          return true;
        },
      };
      strictEqual(gen.pushTo(sink), true);
      deepStrictEqual(received, expected);
    });

    it("accepts an empty pick sequence without calling the sink", () => {
      const gen = Gen.mustBuild(Script.make("constant", () => "hi"), []);
      const sink: PickSink = {
        push() {
          throw new Error("there should be no picks");
        },
      };
      strictEqual(gen.pushTo(sink), true);
    });

    for (const rejectAt of [0, 1]) {
      it(`returns false and stops when the sink rejects pick ${rejectAt}`, () => {
        const gen = Gen.mustBuild(nested, [4, 1, 2]);
        const received: number[][] = [];
        const sink: PickSink = {
          push(req, reply) {
            received.push([req.min, req.max, reply]);
            return received.length !== rejectAt + 1;
          },
        };
        strictEqual(gen.pushTo(sink), false);
        deepStrictEqual(received, expected.slice(0, rejectAt + 1));
        deepStrictEqual([...gen.replies], [4, 1, 2]);
      });
    }

    it("propagates a sink error unchanged and stops sending picks", () => {
      const gen = Gen.mustBuild(nested, [4, 1, 2]);
      const error = new Error("sink failed");
      const received: number[][] = [];
      const sink: PickSink = {
        push(req, reply) {
          received.push([req.min, req.max, reply]);
          if (received.length === 2) throw error;
          return true;
        },
      };
      throws(() => gen.pushTo(sink), (actual: unknown) => {
        strictEqual(actual, error);
        return true;
      });
      deepStrictEqual(received, expected.slice(0, 2));
    });
  });
});
