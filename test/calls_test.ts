import { beforeEach, describe, it } from "@std/testing/bdd";
import { assertEquals, assertThrows } from "@std/assert";

import { Filtered, PickRequest, Script } from "@/arbitrary.ts";
import { filtered } from "../src/results.ts";
import { CallBuffer, unchanged } from "../src/calls.ts";
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
      assertEquals(log.run(roll), 3);

      const buf2 = new CallBuffer();
      buf2.keep(log.callAt(0));
      const log2 = buf2.takeLog();
      assertEquals(log2.run(roll), 3);
    });

    it("preserves a cached script call from a previous log", () => {
      buf.push({ min: 1, max: 6 }, 3);
      buf.endScript(cachableRoll, "cached");
      const log = buf.takeLog();
      assertEquals(log.run(readsCachedRoll), "cached");

      const buf2 = new CallBuffer();
      buf2.keep(log.callAt(0));
      const log2 = buf2.takeLog();
      assertEquals(log2.run(readsCachedRoll), "cached");
    });
  });
});

describe("CallLog", () => {
  let buf = new CallBuffer();

  beforeEach(() => {
    buf = new CallBuffer();
  });

  describe("run", () => {
    describe("for one pick call", () => {
      it("returns the minimum for an empty log", () => {
        const log = buf.takeLog();
        assertEquals(log.run(roll), 1);
      });

      it("uses a recorded pick", () => {
        buf.endPick({ min: 1, max: 6 }, 3);
        const log = buf.takeLog();

        assertEquals(log.run(roll), 3);
      });

      it("returns the minimum if the pick is out of range", () => {
        buf.endPick({ min: 1, max: 7 }, 7);
        const log = buf.takeLog();

        assertEquals(log.run(roll), 1);
      });

      it("takes the first pick if a script call was recorded", () => {
        buf.push({ min: 1, max: 6 }, 3);
        buf.endScript(cachableRoll, "ignored");
        const log = buf.takeLog();

        assertEquals(log.run(roll), 3);
      });
    });

    describe("for one script call", () => {
      it("for an empty log, use minimum picks", () => {
        const log = buf.takeLog();
        assertEquals(log.run(cachableRoll), "rolled 1");
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

        assertEquals(log.run(readsCache), "hello");
      });

      it("when the script doesn't match, rebuilds using the recorded picks", () => {
        buf.push({ min: 1, max: 6 }, 2);
        buf.endScript(differentRoll, "ignored");
        const log = buf.takeLog();

        assertEquals(log.run(cachableRoll), "rolled 2");
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

        assertEquals(log.run(rollAndStr), "3, hello");
      });

      it("regenerates from picks if the script doesn't match", () => {
        buf.endPick({ min: 1, max: 6 }, 3);
        buf.push({ min: 1, max: 6 }, 4);
        buf.endScript(roll, 1);
        const log = buf.takeLog();

        assertEquals(log.run(rollAndStr), "3, rolled 4");
      });

      it("regenerates from a pick call", () => {
        buf.endPick({ min: 1, max: 6 }, 3);
        buf.endPick({ min: 1, max: 6 }, 4);
        const log = buf.takeLog();

        assertEquals(log.run(rollAndStr), "3, rolled 4");
      });

      it("uses a script call as a pick", () => {
        buf.push({ min: 1, max: 6 }, 3);
        buf.push({ min: 1, max: 6 }, 1);
        buf.endScript(roll, 1);
        buf.push({ min: 1, max: 6 }, 4);
        buf.endScript(roll, 1);
        const log = buf.takeLog();

        assertEquals(log.run(rollAndStr), "3, rolled 4");
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

        assertEquals(log.run(script), "hello, 6");
      });

      it("uses a pick as input for a script call", () => {
        buf.endPick({ min: 1, max: 6 }, 3);
        buf.endPick({ min: 1, max: 6 }, 4);
        const log = buf.takeLog();

        assertEquals(log.run(script), "rolled 3, 4");
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

        assertEquals(log.run(script), "hello, world");
      });

      it("regenerates from picks if a script doesn't match", () => {
        buf.push({ min: 1, max: 6 }, 3);
        buf.endScript(cachableRoll, "hello");
        buf.push({ min: 1, max: 6 }, 4);
        buf.endScript(differentRoll, "world");
        const log = buf.takeLog();

        assertEquals(log.run(script), "hello, rolled 4");
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

        assertEquals(log.run(even), 2);
      });

      it("returns filtered if rejected", () => {
        buf.push({ min: 1, max: 6 }, 3);
        buf.endScript(roll, 3);
        const log = buf.takeLog();

        assertEquals(log.run(even), filtered);
      });
    });

    it("returns filtered if the build function throws", () => {
      const log = buf.takeLog();

      const throws = Script.make("throws", () => {
        throw new Filtered("oops");
      });
      assertEquals(log.run(throws), filtered);
    });

    it("throws an Error if the build function throws", () => {
      const log = buf.takeLog();

      const throws = Script.make("throws", () => {
        throw new Error("oops");
      });
      assertThrows(() => log.run(throws), Error, "oops");
    });
  });

  describe("runWithEdit", () => {
    describe("for a script that makes one pick (unsplit)", () => {
      it("makes no change if there is no edit", () => {
        buf.push({ min: 1, max: 6 }, 2);
        buf.endScript(roll, 2);
        const log = buf.takeLog();

        buf = new CallBuffer();
        const result = log.runWithEdits(roll, () => keep, buf);
        assertEquals(result, unchanged);
        assertEquals(buf.length, 1);
        assertEquals(buf.takeLog().run(roll), 2);
      });

      it("edits the pick", () => {
        buf.endPick({ min: 1, max: 6 }, 2);
        const log = buf.takeLog();

        buf = new CallBuffer();
        const result = log.runWithEdits(roll, replaceOnce(0, 0, 0), buf);
        assertEquals(result, 1);
        assertEquals(buf.length, 1);
        assertEquals(buf.takeLog().run(roll), 1);
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
        const result = log.runWithEdits(
          rollTwo,
          removeGroups(new Set([0])),
          buf,
        );
        assertEquals(result, "3, 1");
        assertEquals(buf.length, 2);
        assertEquals(buf.takeLog().run(rollTwo), "3, 1");
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
        const result = log.runWithEdits(roll, replaceOnce(0, 0, 0), buf);
        assertEquals(result, 1);
        assertEquals(buf.length, 1);
        assertEquals(buf.takeLog().run(roll), 1);
      });

      const throws = Script.make("throws", () => {
        throw new Filtered("oops");
      }, { splitCalls: true });

      it("returns filtered if the build function throws", () => {
        buf.endPick({ min: 1, max: 6 }, 2);
        const log = buf.takeLog();
        const result = log.runWithEdits(throws, () => keep, buf);
        assertEquals(result, filtered);
      });
    });

    describe("for a script that calls a script (split)", () => {
      it("returns unchanged when there is no edit", () => {
        buf.push({ min: 1, max: 6 }, 2);
        buf.endScript(roll, -1);
        const log = buf.takeLog();

        buf = new CallBuffer();
        const result = log.runWithEdits(rollStr, () => keep, buf);
        assertEquals(result, unchanged); // ignored cached value
        assertEquals(buf.length, 1);
        assertEquals(buf.takeLog().run(rollStr), "rolled 2");
      });

      it("returns unchanged when there is a cached value", () => {
        buf.push({ min: 1, max: 6 }, 2);
        buf.endScript(cachableRoll, "cached");
        const log = buf.takeLog();

        buf = new CallBuffer();
        const result = log.runWithEdits(readsCachedRoll, () => keep, buf);
        assertEquals(result, unchanged);
        assertEquals(buf.length, 1);
        assertEquals(buf.takeLog().run(readsCachedRoll), "cached");
      });

      it("edits a pick (uncached)", () => {
        buf.push({ min: 1, max: 6 }, 2);
        buf.endScript(roll, -1);
        const log = buf.takeLog();

        buf = new CallBuffer();
        const result = log.runWithEdits(rollStr, replaceOnce(0, 0, 0), buf);
        assertEquals(result, "rolled 1");
        assertEquals(buf.length, 1);
        assertEquals(buf.takeLog().run(rollStr), "rolled 1");
      });

      it("doesn't use the cached value when a pick is edited", () => {
        buf.push({ min: 1, max: 6 }, 2);
        buf.endScript(cachableRoll, "cached");
        const log = buf.takeLog();

        buf = new CallBuffer();
        const result = log.runWithEdits(
          readsCachedRoll,
          replaceOnce(0, 0, 5),
          buf,
        );
        assertEquals(result, "rolled 6");
        assertEquals(buf.length, 1);
        assertEquals(buf.takeLog().run(readsCachedRoll), "rolled 6");
      });
    });
  });
});
