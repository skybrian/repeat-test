import { beforeEach, describe, it } from "@std/testing/bdd";
import { assertEquals, assertThrows } from "@std/assert";

import { Filtered, PickRequest, Script } from "@/arbitrary.ts";
import { filtered } from "../src/results.ts";
import { keep, replaceOnce } from "../src/edits.ts";
import { CallBuffer } from "../src/calls.ts";

import {
  replay,
  replayWithDeletedRange,
  replayWithEdits,
  unchanged,
} from "../src/replay.ts";

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

describe("replay", () => {
  let buf = new CallBuffer();

  beforeEach(() => {
    buf = new CallBuffer();
  });

  describe("for one pick call", () => {
    it("returns the minimum for an empty log", () => {
      assertEquals(replay(roll, []), 1);
    });

    it("uses a recorded pick", () => {
      buf.endPick({ min: 1, max: 6 }, 3);
      const calls = buf.take();

      assertEquals(replay(roll, calls), 3);
    });

    it("returns the minimum if the pick is out of range", () => {
      buf.endPick({ min: 1, max: 7 }, 7);
      const calls = buf.take();

      assertEquals(replay(roll, calls), 1);
    });

    it("takes the first pick if a script call was recorded", () => {
      buf.push({ min: 1, max: 6 }, 3);
      buf.endScript(cachableRoll, "ignored");
      const calls = buf.take();

      assertEquals(replay(roll, calls), 3);
    });
  });

  describe("for one script call", () => {
    it("for an empty log, use minimum picks", () => {
      assertEquals(replay(cachableRoll, []), "rolled 1");
    });

    it("when the script matches, returns the recorded value", () => {
      const cached = Script.make<string>("cached", () => {
        throw new Error("shouldn't get here");
      }, { cachable: true });
      buf.endScript(cached, "hello");
      const calls = buf.take();

      const readsCache = Script.make("readsCache", (pick) => {
        return pick(cached);
      });

      assertEquals(replay(readsCache, calls), "hello");
    });

    it("when the script doesn't match, rebuilds using the recorded picks", () => {
      buf.push({ min: 1, max: 6 }, 2);
      buf.endScript(differentRoll, "ignored");
      const calls = buf.take();

      assertEquals(replay(cachableRoll, calls), "rolled 2");
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
      const calls = buf.take();

      assertEquals(replay(rollAndStr, calls), "3, hello");
    });

    it("regenerates from picks if the script doesn't match", () => {
      buf.endPick({ min: 1, max: 6 }, 3);
      buf.push({ min: 1, max: 6 }, 4);
      buf.endScript(roll, 1);
      const calls = buf.take();

      assertEquals(replay(rollAndStr, calls), "3, rolled 4");
    });

    it("regenerates from a pick call", () => {
      buf.endPick({ min: 1, max: 6 }, 3);
      buf.endPick({ min: 1, max: 6 }, 4);
      const calls = buf.take();

      assertEquals(replay(rollAndStr, calls), "3, rolled 4");
    });

    it("uses a script call as a pick", () => {
      buf.push({ min: 1, max: 6 }, 3);
      buf.push({ min: 1, max: 6 }, 1);
      buf.endScript(roll, 1);
      buf.push({ min: 1, max: 6 }, 4);
      buf.endScript(roll, 1);
      const calls = buf.take();

      assertEquals(replay(rollAndStr, calls), "3, rolled 4");
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
      const calls = buf.take();

      assertEquals(replay(script, calls), "hello, 6");
    });

    it("uses a pick as input for a script call", () => {
      buf.endPick({ min: 1, max: 6 }, 3);
      buf.endPick({ min: 1, max: 6 }, 4);
      const calls = buf.take();

      assertEquals(replay(script, calls), "rolled 3, 4");
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
      const calls = buf.take();

      assertEquals(replay(script, calls), "hello, world");
    });

    it("regenerates from picks if a script doesn't match", () => {
      buf.push({ min: 1, max: 6 }, 3);
      buf.endScript(cachableRoll, "hello");
      buf.push({ min: 1, max: 6 }, 4);
      buf.endScript(differentRoll, "world");
      const calls = buf.take();

      assertEquals(replay(script, calls), "hello, rolled 4");
    });
  });

  describe("for a script call with an accept function", () => {
    const even = Script.make("even", (pick) => {
      return pick(roll, { accept: (val) => (val % 2) === 0 });
    });

    it("returns the value if accepted", () => {
      buf.push({ min: 1, max: 6 }, 2);
      buf.endScript(roll, 2);
      const calls = buf.take();

      assertEquals(replay(even, calls), 2);
    });

    it("returns filtered if rejected", () => {
      buf.push({ min: 1, max: 6 }, 3);
      buf.endScript(roll, 3);
      const calls = buf.take();

      assertEquals(replay(even, calls), filtered);
    });
  });

  it("returns filtered if the build function throws", () => {
    const throws = Script.make("throws", () => {
      throw new Filtered("oops");
    });
    assertEquals(replay(throws, []), filtered);
  });

  it("throws an Error if the build function throws", () => {
    const throws = Script.make("throws", () => {
      throw new Error("oops");
    });
    assertThrows(() => replay(throws, []), Error, "oops");
  });
});

describe("replayWithEdits", () => {
  let buf = new CallBuffer();

  beforeEach(() => {
    buf = new CallBuffer();
  });

  describe("for a script that makes one pick (unsplit)", () => {
    it("makes no change if there is no call to edit", () => {
      const result = replayWithEdits(roll, [], () => keep, buf);
      assertEquals(result, unchanged);
      assertEquals(buf.length, 1);
    });

    it("makes no change if there is no edit", () => {
      buf.push({ min: 1, max: 6 }, 2);
      buf.endScript(roll, 2);
      const calls = buf.take();

      buf = new CallBuffer();
      const result = replayWithEdits(roll, calls, () => keep, buf);
      assertEquals(result, unchanged);
      assertEquals(buf.length, 1);
      assertEquals(replay(roll, buf.take()), 2);
    });

    it("edits the pick", () => {
      buf.endPick({ min: 1, max: 6 }, 2);
      const calls = buf.take();

      buf = new CallBuffer();
      const result = replayWithEdits(roll, calls, replaceOnce(0, 0, 0), buf);
      assertEquals(result, 1);
      assertEquals(buf.length, 1);
      assertEquals(replay(roll, buf.take()), 1);
    });
  });

  describe("for a script that makes one pick (split)", () => {
    const roll = Script.make("roll", (pick) => {
      return pick(new PickRequest(1, 6));
    }, { splitCalls: true });

    it("makes no change if there is no call to edit", () => {
      const result = replayWithEdits(roll, [], () => keep, buf);
      assertEquals(result, unchanged);
      assertEquals(buf.length, 1);
    });

    it("edits the pick", () => {
      buf.endPick({ min: 1, max: 6 }, 2);
      const calls = buf.take();

      buf = new CallBuffer();
      const result = replayWithEdits(roll, calls, replaceOnce(0, 0, 0), buf);
      assertEquals(result, 1);
      assertEquals(buf.length, 1);
      assertEquals(replay(roll, buf.take()), 1);
    });

    const throws = Script.make("throws", () => {
      throw new Filtered("oops");
    }, { splitCalls: true });

    it("returns filtered if the build function throws", () => {
      buf.endPick({ min: 1, max: 6 }, 2);
      const calls = buf.take();
      const result = replayWithEdits(throws, calls, () => keep, buf);
      assertEquals(result, filtered);
    });
  });

  describe("for a script that calls a script (split)", () => {
    it("returns unchanged when there is no edit", () => {
      buf.push({ min: 1, max: 6 }, 2);
      buf.endScript(roll, -1);
      const calls = buf.take();

      buf = new CallBuffer();
      const result = replayWithEdits(rollStr, calls, () => keep, buf);
      assertEquals(result, unchanged); // ignored cached value
      assertEquals(buf.length, 1);
      assertEquals(replay(rollStr, buf.take()), "rolled 2");
    });

    it("returns unchanged when there is a cached value", () => {
      buf.push({ min: 1, max: 6 }, 2);
      buf.endScript(cachableRoll, "cached");
      const calls = buf.take();

      buf = new CallBuffer();
      const result = replayWithEdits(readsCachedRoll, calls, () => keep, buf);
      assertEquals(result, unchanged);
      assertEquals(buf.length, 1);
      assertEquals(replay(readsCachedRoll, buf.take()), "cached");
    });

    it("edits a pick (uncached)", () => {
      buf.push({ min: 1, max: 6 }, 2);
      buf.endScript(roll, -1);
      const calls = buf.take();

      buf = new CallBuffer();
      const result = replayWithEdits(rollStr, calls, replaceOnce(0, 0, 0), buf);
      assertEquals(result, "rolled 1");
      assertEquals(buf.length, 1);
      assertEquals(replay(rollStr, buf.take()), "rolled 1");
    });

    it("doesn't use the cached value when a pick is edited", () => {
      buf.push({ min: 1, max: 6 }, 2);
      buf.endScript(cachableRoll, "cached");
      const calls = buf.take();

      buf = new CallBuffer();
      const result = replayWithEdits(
        readsCachedRoll,
        calls,
        replaceOnce(0, 0, 5),
        buf,
      );
      assertEquals(result, "rolled 6");
      assertEquals(buf.length, 1);
      assertEquals(replay(readsCachedRoll, buf.take()), "rolled 6");
    });
  });
});

describe("replayWithDeletedRange", () => {
  let buf = new CallBuffer();

  beforeEach(() => {
    buf = new CallBuffer();
  });

  it("removes one group", () => {
    buf.push({ min: 1, max: 6 }, 2);
    buf.endScript(roll, 2);
    buf.push({ min: 1, max: 6 }, 3);
    buf.endScript(roll, 3);
    const calls = buf.take();

    const rollTwo = Script.make("rollTwo", (pick) => {
      const first = pick(roll);
      const second = pick(roll);
      return `${first}, ${second}`;
    }, { splitCalls: true });

    buf = new CallBuffer();
    const result = replayWithDeletedRange(rollTwo, calls, 0, 1, buf);
    assertEquals(result, "3, 1");
    assertEquals(buf.length, 2);
    assertEquals(replay(rollTwo, buf.take()), "3, 1");
  });
});
