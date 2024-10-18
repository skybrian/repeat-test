import { beforeEach, describe, it } from "@std/testing/bdd";
import { assertEquals, assertThrows } from "@std/assert";

import { Filtered, type Pickable, PickRequest, Script } from "@/arbitrary.ts";
import { filtered } from "../src/results.ts";
import { CallBuffer } from "../src/calls.ts";

const roll = Script.make("roll", (pick) => {
  return pick(new PickRequest(1, 6));
});

const cachableRoll = Script.make("rollStr", (pick) => {
  return `rolled ${pick(roll)}`;
}, { cachable: true });

const differentRoll = Script.make("rollStr", (pick) => {
  return `rolled ${pick(roll)}`;
}, { cachable: true });

describe("CallLog", () => {
  let buf = new CallBuffer();

  beforeEach(() => {
    buf = new CallBuffer();
  });

  describe("build", () => {
    describe("for one pick call", () => {
      it("returns the minimum for an empty log", () => {
        const log = buf.takeLog();
        assertEquals(log.build(roll), 1);
      });

      it("uses a recorded pick", () => {
        buf.push({ min: 1, max: 6 }, 3);
        buf.endPick();
        const log = buf.takeLog();

        assertEquals(log.build(roll), 3);
      });

      it("returns the minimum if the pick is out of range", () => {
        buf.push({ min: 1, max: 7 }, 7);
        buf.endPick();
        const log = buf.takeLog();

        assertEquals(log.build(roll), 1);
      });

      it("takes the first pick if a script call was recorded", () => {
        buf.push({ min: 1, max: 6 }, 3);
        buf.endScript(cachableRoll, "ignored");
        const log = buf.takeLog();

        assertEquals(log.build(roll), 3);
      });
    });

    describe("for one script call", () => {
      it("for an empty log, use minimum picks", () => {
        const log = buf.takeLog();
        assertEquals(log.build(cachableRoll), "rolled 1");
      });

      it("when the script matches, returns the recorded value", () => {
        const cached = Script.make<string>("cached", () => {
          throw new Error("shouldn't get here");
        }, { cachable: true });
        buf.endScript(cached, "hello");
        const log = buf.takeLog();

        const readsCache = Script.make("readsCache", (pick) => {
          return pick(cached);
        });

        assertEquals(log.build(readsCache), "hello");
      });

      it("when the script doesn't match, rebuilds using the recorded picks", () => {
        buf.push({ min: 1, max: 6 }, 2);
        buf.endScript(differentRoll, "ignored");
        const log = buf.takeLog();

        assertEquals(log.build(cachableRoll), "rolled 2");
      });
    });

    describe("for a pick call followed by a cachable script call", () => {
      const rollAndStr = Script.make("rollAndStr", (pick) => {
        return `${pick(new PickRequest(1, 6))}, ${pick(cachableRoll)}`;
      });

      it("uses the cached value if the script call matches", () => {
        buf.push({ min: 1, max: 6 }, 3);
        buf.endPick();
        buf.push({ min: 1, max: 6 }, 6);
        buf.endScript(cachableRoll, "hello");
        const log = buf.takeLog();

        assertEquals(log.build(rollAndStr), "3, hello");
      });

      it("regenerates from picks if the script doesn't match", () => {
        buf.push({ min: 1, max: 6 }, 3);
        buf.endPick();
        buf.push({ min: 1, max: 6 }, 4);
        buf.endScript(roll, 1);
        const log = buf.takeLog();

        assertEquals(log.build(rollAndStr), "3, rolled 4");
      });

      it("regenerates from a pick call", () => {
        buf.push({ min: 1, max: 6 }, 3);
        buf.endPick();
        buf.push({ min: 1, max: 6 }, 4);
        buf.endPick();
        const log = buf.takeLog();

        assertEquals(log.build(rollAndStr), "3, rolled 4");
      });

      it("uses a script call as a pick", () => {
        buf.push({ min: 1, max: 6 }, 3);
        buf.push({ min: 1, max: 6 }, 1);
        buf.endScript(roll, 1);
        buf.push({ min: 1, max: 6 }, 4);
        buf.endScript(roll, 1);
        const log = buf.takeLog();

        assertEquals(log.build(rollAndStr), "3, rolled 4");
      });
    });

    describe("for a cachable script call followed by a pick call", () => {
      const script = Script.make("strAndRoll", (pick) => {
        return `${pick(cachableRoll)}, ${pick(new PickRequest(1, 6))}`;
      });

      it("uses the cached value if the script call matches", () => {
        buf.push({ min: 1, max: 6 }, 3);
        buf.endScript(cachableRoll, "hello");
        buf.push({ min: 1, max: 6 }, 6);
        buf.endPick();
        const log = buf.takeLog();

        assertEquals(log.build(script), "hello, 6");
      });

      it("uses a pick as input for a script call", () => {
        buf.push({ min: 1, max: 6 }, 3);
        buf.endPick();
        buf.push({ min: 1, max: 6 }, 4);
        buf.endPick();
        const log = buf.takeLog();

        assertEquals(log.build(script), "rolled 3, 4");
      });
    });

    describe("for two script calls", () => {
      const script = Script.make("two rolls", (pick) => {
        return `${pick(cachableRoll)}, ${pick(cachableRoll)}`;
      });

      it("uses matching values", () => {
        buf.push({ min: 1, max: 6 }, 3);
        buf.endScript(cachableRoll, "hello");
        buf.push({ min: 1, max: 6 }, 4);
        buf.endScript(cachableRoll, "world");
        const log = buf.takeLog();

        assertEquals(log.build(script), "hello, world");
      });

      it("regenerates from picks if a script doesn't match", () => {
        buf.push({ min: 1, max: 6 }, 3);
        buf.endScript(cachableRoll, "hello");
        buf.push({ min: 1, max: 6 }, 4);
        buf.endScript(differentRoll, "world");
        const log = buf.takeLog();

        assertEquals(log.build(script), "hello, rolled 4");
      });
    });

    describe("for a script call with an accept function", () => {
      const even = Script.make("even", (pick) => {
        return pick(roll, { accept: (val) => (val % 2) === 0 });
      });

      it("returns the value if accepted", () => {
        buf.push({ min: 1, max: 6 }, 2);
        buf.endScript(roll, 2);
        const log = buf.takeLog();

        assertEquals(log.build(even), 2);
      });

      it("returns filtered if rejected", () => {
        buf.push({ min: 1, max: 6 }, 3);
        buf.endScript(roll, 3);
        const log = buf.takeLog();

        assertEquals(log.build(even), filtered);
      });
    });

    describe("for a pickable that's not a script", () => {
      const pickable: Pickable<number> = {
        buildFrom: (pick) => {
          return pick(roll);
        },
      };

      it("doesn't use a cached result", () => {
        buf.push({ min: 1, max: 6 }, 2);
        buf.endScript(roll, 3);
        const log = buf.takeLog();

        assertEquals(log.build(pickable), 2);
      });
    });

    it("returns filtered if the build function throws", () => {
      const log = buf.takeLog();

      const throws = Script.make("throws", () => {
        throw new Filtered("oops");
      });
      assertEquals(log.build(throws), filtered);
    });

    it("throws an Error if the build function throws", () => {
      const log = buf.takeLog();

      const throws = Script.make("throws", () => {
        throw new Error("oops");
      });
      assertThrows(() => log.build(throws), Error, "oops");
    });
  });
});
