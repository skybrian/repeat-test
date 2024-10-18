import { beforeEach, describe, it } from "@std/testing/bdd";
import { assertEquals, assertThrows } from "@std/assert";

import { Filtered, type Pickable, PickRequest, Script } from "@/arbitrary.ts";
import { filtered } from "../src/results.ts";
import { CallLog } from "../src/calls.ts";

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
  let log = new CallLog();

  beforeEach(() => {
    log = new CallLog();
  });

  describe("build", () => {
    it("builds a constant", () => {
      assertEquals(log.build(Script.constant("one", 1)), 1);
    });

    describe("for one pick call", () => {
      it("returns the minimum for an empty log", () => {
        assertEquals(log.build(roll), 1);
      });

      it("uses a recorded pick", () => {
        log.pushPick({ min: 1, max: 6 }, 3);
        log.endPickCall();
        assertEquals(log.build(roll), 3);
      });

      it("returns the minimum if the pick is out of range", () => {
        log.pushPick({ min: 1, max: 7 }, 7);
        log.endPickCall();

        assertEquals(log.build(roll), 1);
      });

      it("takes the first pick if a script call was recorded", () => {
        log.pushPick({ min: 1, max: 6 }, 3);
        log.endScriptCall(cachableRoll, "ignored");
        assertEquals(log.build(roll), 3);
      });
    });

    describe("for one script call", () => {
      it("for an empty log, use minimum picks", () => {
        assertEquals(log.build(cachableRoll), "rolled 1");
      });

      it("when the script matches, returns the recorded value", () => {
        const cached = Script.make<string>("cached", () => {
          throw new Error("shouldn't get here");
        }, { cachable: true });
        log.endScriptCall(cached, "hello");

        const readsCache = Script.make("readsCache", (pick) => {
          return pick(cached);
        });

        assertEquals(log.build(readsCache), "hello");
      });

      it("when the script doesn't match, rebuilds using the recorded picks", () => {
        log.pushPick({ min: 1, max: 6 }, 2);
        log.endScriptCall(differentRoll, "ignored");
        assertEquals(log.build(cachableRoll), "rolled 2");
      });
    });

    describe("for a pick call followed by a cachable script call", () => {
      const rollAndStr = Script.make("rollAndStr", (pick) => {
        return `${pick(new PickRequest(1, 6))}, ${pick(cachableRoll)}`;
      });

      it("uses the cached value if the script call matches", () => {
        log.pushPick({ min: 1, max: 6 }, 3);
        log.endPickCall();
        log.pushPick({ min: 1, max: 6 }, 6);
        log.endScriptCall(cachableRoll, "hello");
        assertEquals(log.build(rollAndStr), "3, hello");
      });

      it("regenerates from picks if the script doesn't match", () => {
        log.pushPick({ min: 1, max: 6 }, 3);
        log.endPickCall();
        log.pushPick({ min: 1, max: 6 }, 4);
        log.endScriptCall(roll, 1);
        assertEquals(log.build(rollAndStr), "3, rolled 4");
      });

      it("regenerates from a pick call", () => {
        log.pushPick({ min: 1, max: 6 }, 3);
        log.endPickCall();
        log.pushPick({ min: 1, max: 6 }, 4);
        log.endPickCall();
        assertEquals(log.build(rollAndStr), "3, rolled 4");
      });

      it("uses a script call as a pick", () => {
        log.pushPick({ min: 1, max: 6 }, 3);
        log.pushPick({ min: 1, max: 6 }, 1);
        log.endScriptCall(roll, 1);
        log.pushPick({ min: 1, max: 6 }, 4);
        log.endScriptCall(roll, 1);
        assertEquals(log.build(rollAndStr), "3, rolled 4");
      });
    });

    describe("for a cachable script call followed by a pick call", () => {
      const script = Script.make("strAndRoll", (pick) => {
        return `${pick(cachableRoll)}, ${pick(new PickRequest(1, 6))}`;
      });

      it("uses the cached value if the script call matches", () => {
        log.pushPick({ min: 1, max: 6 }, 3);
        log.endScriptCall(cachableRoll, "hello");
        log.pushPick({ min: 1, max: 6 }, 6);
        log.endPickCall();
        assertEquals(log.build(script), "hello, 6");
      });

      it("uses a pick as input for a script call", () => {
        log.pushPick({ min: 1, max: 6 }, 3);
        log.endPickCall();
        log.pushPick({ min: 1, max: 6 }, 4);
        log.endPickCall();
        assertEquals(log.build(script), "rolled 3, 4");
      });
    });

    describe("for two script calls", () => {
      const script = Script.make("two rolls", (pick) => {
        return `${pick(cachableRoll)}, ${pick(cachableRoll)}`;
      });

      it("uses matching values", () => {
        log.pushPick({ min: 1, max: 6 }, 3);
        log.endScriptCall(cachableRoll, "hello");
        log.pushPick({ min: 1, max: 6 }, 4);
        log.endScriptCall(cachableRoll, "world");
        assertEquals(log.build(script), "hello, world");
      });

      it("regenerates from picks if a script doesn't match", () => {
        log.pushPick({ min: 1, max: 6 }, 3);
        log.endScriptCall(cachableRoll, "hello");
        log.pushPick({ min: 1, max: 6 }, 4);
        log.endScriptCall(differentRoll, "world");
        assertEquals(log.build(script), "hello, rolled 4");
      });
    });

    describe("for a script call with an accept function", () => {
      const even = Script.make("even", (pick) => {
        return pick(roll, { accept: (val) => (val % 2) === 0 });
      });

      it("returns the value if accepted", () => {
        log.pushPick({ min: 1, max: 6 }, 2);
        log.endScriptCall(roll, 2);
        assertEquals(log.build(even), 2);
      });

      it("returns filtered if rejected", () => {
        log.pushPick({ min: 1, max: 6 }, 3);
        log.endScriptCall(roll, 3);
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
        log.pushPick({ min: 1, max: 6 }, 2);
        log.endScriptCall(roll, 3);
        assertEquals(log.build(pickable), 2);
      });
    });

    it("returns filtered if the build function throws", () => {
      const throws = Script.make("throws", () => {
        throw new Filtered("oops");
      });
      assertEquals(log.build(throws), filtered);
    });

    it("throws an Error if the build function throws", () => {
      const throws = Script.make("throws", () => {
        throw new Error("oops");
      });
      assertThrows(() => log.build(throws), Error, "oops");
    });
  });
});
