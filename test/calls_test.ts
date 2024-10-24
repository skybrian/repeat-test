import { beforeEach, describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertFalse, assertThrows } from "@std/assert";

import { Filtered, type Pickable, PickRequest, Script } from "@/arbitrary.ts";
import { filtered } from "../src/results.ts";
import { CallBuffer } from "../src/calls.ts";
import { keep, removeGroups, replaceOnce } from "../src/edits.ts";

const roll = Script.make("roll", (pick) => {
  return pick(new PickRequest(1, 6));
});

const rollStr = Script.make("rollStr", (pick) => {
  return `rolled ${pick(roll)}`;
}, { splitCalls: true });

const cachableRoll = Script.make("rollStr", (pick) => {
  return `rolled ${pick(roll)}`;
}, { cachable: true });

const readsCachedRoll = Script.make("readsCache", (pick) => {
  return pick(cachableRoll);
}, { splitCalls: true });

const differentRoll = Script.make("rollStr", (pick) => {
  return `rolled ${pick(roll)}`;
}, { cachable: true });

describe("CallBuffer", () => {
  let buf = new CallBuffer();

  beforeEach(() => {
    buf = new CallBuffer();
  });

  describe("keep", () => {
    it("preserves a pick call from a previous log", () => {
      buf.endPick({ min: 1, max: 6 }, 3);
      const log = buf.takeLog();
      assertEquals(log.rebuild(roll), 3);

      const buf2 = new CallBuffer();
      buf2.keep(log.callAt(0));
      const log2 = buf2.takeLog();
      assertEquals(log2.rebuild(roll), 3);
    });

    it("preserves a cached script call from a previous log", () => {
      buf.push({ min: 1, max: 6 }, 3);
      buf.endScript(cachableRoll, "cached");
      const log = buf.takeLog();
      assertEquals(log.rebuild(readsCachedRoll), "cached");

      const buf2 = new CallBuffer();
      buf2.keep(log.callAt(0));
      const log2 = buf2.takeLog();
      assertEquals(log2.rebuild(readsCachedRoll), "cached");
    });
  });
});

describe("CallLog", () => {
  let buf = new CallBuffer();

  beforeEach(() => {
    buf = new CallBuffer();
  });

  describe("build", () => {
    describe("for one pick call", () => {
      it("returns the minimum for an empty log", () => {
        const log = buf.takeLog();
        assertEquals(log.rebuild(roll), 1);
      });

      it("uses a recorded pick", () => {
        buf.endPick({ min: 1, max: 6 }, 3);
        const log = buf.takeLog();

        assertEquals(log.rebuild(roll), 3);
      });

      it("returns the minimum if the pick is out of range", () => {
        buf.endPick({ min: 1, max: 7 }, 7);
        const log = buf.takeLog();

        assertEquals(log.rebuild(roll), 1);
      });

      it("takes the first pick if a script call was recorded", () => {
        buf.push({ min: 1, max: 6 }, 3);
        buf.endScript(cachableRoll, "ignored");
        const log = buf.takeLog();

        assertEquals(log.rebuild(roll), 3);
      });
    });

    describe("for one script call", () => {
      it("for an empty log, use minimum picks", () => {
        const log = buf.takeLog();
        assertEquals(log.rebuild(cachableRoll), "rolled 1");
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

        assertEquals(log.rebuild(readsCache), "hello");
      });

      it("when the script doesn't match, rebuilds using the recorded picks", () => {
        buf.push({ min: 1, max: 6 }, 2);
        buf.endScript(differentRoll, "ignored");
        const log = buf.takeLog();

        assertEquals(log.rebuild(cachableRoll), "rolled 2");
      });
    });

    describe("for a pick call followed by a cachable script call", () => {
      const rollAndStr = Script.make("rollAndStr", (pick) => {
        return `${pick(new PickRequest(1, 6))}, ${pick(cachableRoll)}`;
      });

      it("uses the cached value if the script call matches", () => {
        buf.endPick({ min: 1, max: 6 }, 3);
        buf.push({ min: 1, max: 6 }, 6);
        buf.endScript(cachableRoll, "hello");
        const log = buf.takeLog();

        assertEquals(log.rebuild(rollAndStr), "3, hello");
      });

      it("regenerates from picks if the script doesn't match", () => {
        buf.endPick({ min: 1, max: 6 }, 3);
        buf.push({ min: 1, max: 6 }, 4);
        buf.endScript(roll, 1);
        const log = buf.takeLog();

        assertEquals(log.rebuild(rollAndStr), "3, rolled 4");
      });

      it("regenerates from a pick call", () => {
        buf.endPick({ min: 1, max: 6 }, 3);
        buf.endPick({ min: 1, max: 6 }, 4);
        const log = buf.takeLog();

        assertEquals(log.rebuild(rollAndStr), "3, rolled 4");
      });

      it("uses a script call as a pick", () => {
        buf.push({ min: 1, max: 6 }, 3);
        buf.push({ min: 1, max: 6 }, 1);
        buf.endScript(roll, 1);
        buf.push({ min: 1, max: 6 }, 4);
        buf.endScript(roll, 1);
        const log = buf.takeLog();

        assertEquals(log.rebuild(rollAndStr), "3, rolled 4");
      });
    });

    describe("for a cachable script call followed by a pick call", () => {
      const script = Script.make("strAndRoll", (pick) => {
        return `${pick(cachableRoll)}, ${pick(new PickRequest(1, 6))}`;
      });

      it("uses the cached value if the script call matches", () => {
        buf.push({ min: 1, max: 6 }, 3);
        buf.endScript(cachableRoll, "hello");
        buf.endPick({ min: 1, max: 6 }, 6);
        const log = buf.takeLog();

        assertEquals(log.rebuild(script), "hello, 6");
      });

      it("uses a pick as input for a script call", () => {
        buf.endPick({ min: 1, max: 6 }, 3);
        buf.endPick({ min: 1, max: 6 }, 4);
        const log = buf.takeLog();

        assertEquals(log.rebuild(script), "rolled 3, 4");
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

        assertEquals(log.rebuild(script), "hello, world");
      });

      it("regenerates from picks if a script doesn't match", () => {
        buf.push({ min: 1, max: 6 }, 3);
        buf.endScript(cachableRoll, "hello");
        buf.push({ min: 1, max: 6 }, 4);
        buf.endScript(differentRoll, "world");
        const log = buf.takeLog();

        assertEquals(log.rebuild(script), "hello, rolled 4");
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

        assertEquals(log.rebuild(even), 2);
      });

      it("returns filtered if rejected", () => {
        buf.push({ min: 1, max: 6 }, 3);
        buf.endScript(roll, 3);
        const log = buf.takeLog();

        assertEquals(log.rebuild(even), filtered);
      });
    });

    describe("for a pickable that's not a script", () => {
      const pickable: Pickable<number> = {
        directBuild: (pick) => {
          return pick(roll);
        },
      };

      it("doesn't use a cached result", () => {
        buf.push({ min: 1, max: 6 }, 2);
        buf.endScript(roll, 3);
        const log = buf.takeLog();

        assertEquals(log.rebuild(pickable), 2);
      });
    });

    it("returns filtered if the build function throws", () => {
      const log = buf.takeLog();

      const throws = Script.make("throws", () => {
        throw new Filtered("oops");
      });
      assertEquals(log.rebuild(throws), filtered);
    });

    it("throws an Error if the build function throws", () => {
      const log = buf.takeLog();

      const throws = Script.make("throws", () => {
        throw new Error("oops");
      });
      assertThrows(() => log.rebuild(throws), Error, "oops");
    });
  });

  describe("tryEdit", () => {
    describe("for a script that makes one pick (unsplit)", () => {
      it("makes no change if there is no edit", () => {
        buf.push({ min: 1, max: 6 }, 2);
        buf.endScript(roll, 2);
        const log = buf.takeLog();

        buf = new CallBuffer();
        const val = log.tryEdit(roll, () => keep, buf);
        assertEquals(val, 2);
        assertEquals(buf.length, 1);
        assertFalse(buf.changed);
        assertEquals(buf.takeLog().rebuild(roll), 2);
      });

      it("edits the pick", () => {
        buf.endPick({ min: 1, max: 6 }, 2);
        const log = buf.takeLog();

        buf = new CallBuffer();
        const val = log.tryEdit(roll, replaceOnce(0, 0, 0), buf);
        assertEquals(val, 1);
        assertEquals(buf.length, 1);
        assert(buf.changed);
        assertEquals(buf.takeLog().rebuild(roll), 1);
      });

      it("removes a group", () => {
        buf.push({ min: 1, max: 6 }, 2);
        buf.endScript(roll, 2);
        buf.push({ min: 1, max: 6 }, 3);
        buf.endScript(roll, 3);
        const log = buf.takeLog();

        const rollTwo = Script.make("rollTwo", (pick) => {
          const first = pick(roll);
          const second = pick(roll);
          return `${first}, ${second}`;
        }, { splitCalls: true });

        buf = new CallBuffer();
        const val = log.tryEdit(rollTwo, removeGroups(new Set([0])), buf);
        assertEquals(val, "3, 1");
        assert(buf.changed);
        assertEquals(buf.length, 2);
        assertEquals(buf.takeLog().rebuild(rollTwo), "3, 1");
      });
    });

    describe("for a script that makes one pick (split)", () => {
      const roll = Script.make("roll", (pick) => {
        return pick(new PickRequest(1, 6));
      }, { splitCalls: true });

      it("edits the pick", () => {
        buf.endPick({ min: 1, max: 6 }, 2);
        const log = buf.takeLog();

        buf = new CallBuffer();
        const val = log.tryEdit(roll, replaceOnce(0, 0, 0), buf);
        assertEquals(val, 1);
        assertEquals(buf.length, 1);
        assert(buf.changed);
        assertEquals(buf.takeLog().rebuild(roll), 1);
      });
    });

    describe("for a script that calls a script (split)", () => {
      it("makes no change if there is no edit (uncached)", () => {
        buf.push({ min: 1, max: 6 }, 2);
        buf.endScript(roll, -1);
        const log = buf.takeLog();

        buf = new CallBuffer();
        const val = log.tryEdit(rollStr, () => keep, buf);
        assertEquals(val, "rolled 2"); // ignored cached value
        assertEquals(buf.length, 1);
        assertFalse(buf.changed);
        assertEquals(buf.takeLog().rebuild(rollStr), "rolled 2");
      });

      it("uses a cached value when there is no change)", () => {
        buf.push({ min: 1, max: 6 }, 2);
        buf.endScript(cachableRoll, "cached");
        const log = buf.takeLog();

        buf = new CallBuffer();
        const val = log.tryEdit(readsCachedRoll, () => keep, buf);
        assertEquals(val, "cached");
        assertEquals(buf.length, 1);
        assertFalse(buf.changed);
        assertEquals(buf.takeLog().rebuild(readsCachedRoll), "cached");
      });

      it("edits a pick (uncached)", () => {
        buf.push({ min: 1, max: 6 }, 2);
        buf.endScript(roll, -1);
        const log = buf.takeLog();

        buf = new CallBuffer();
        const val = log.tryEdit(rollStr, replaceOnce(0, 0, 0), buf);
        assertEquals(val, "rolled 1");
        assertEquals(buf.length, 1);
        assert(buf.changed);
        assertEquals(buf.takeLog().rebuild(rollStr), "rolled 1");
      });

      it("doesn't use the cached value when a pick is edited", () => {
        buf.push({ min: 1, max: 6 }, 2);
        buf.endScript(cachableRoll, "cached");
        const log = buf.takeLog();

        buf = new CallBuffer();
        const val = log.tryEdit(readsCachedRoll, replaceOnce(0, 0, 5), buf);
        assertEquals(val, "rolled 6");
        assertEquals(buf.length, 1);
        assert(buf.changed);
        assertEquals(buf.takeLog().rebuild(readsCachedRoll), "rolled 6");
      });
    });
  });
});
