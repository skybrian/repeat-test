import { beforeEach, describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";

import { PickRequest, Script } from "@/arbitrary.ts";
import { CallBuffer } from "../src/calls.ts";

import { replay } from "../src/replay.ts";

const roll = Script.make("roll", (pick) => {
  return pick(new PickRequest(1, 6));
});

const cachableRoll = Script.make("rollStr", (pick) => {
  return `rolled ${pick(roll)}`;
}, { cachable: true });

const readsCachedRoll = Script.make("readsCache", (pick) => {
  return pick(cachableRoll);
}, { splitCalls: true });

describe("CallBuffer", () => {
  let buf = new CallBuffer();

  beforeEach(() => {
    buf = new CallBuffer();
  });

  describe("keep", () => {
    it("preserves a pick call from a previous log", () => {
      buf.push({ min: 1, max: 6 }, 3);
      buf.endPick();
      const calls = buf.take();
      assertEquals(replay(roll, calls), 3);

      const buf2 = new CallBuffer();
      buf2.keep(calls[0]);
      assertEquals(replay(roll, buf2.take()), 3);
    });

    it("preserves a cached script call from a previous log", () => {
      buf.push({ min: 1, max: 6 }, 3);
      buf.endScript(cachableRoll, "cached");
      const calls = buf.take();
      assertEquals(replay(readsCachedRoll, calls), "cached");

      const buf2 = new CallBuffer();
      buf2.keep(calls[0]);
      assertEquals(replay(readsCachedRoll, buf2.take()), "cached");
    });
  });
});
