import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertThrows } from "@std/assert";
import { assertFirstValues, assertValues } from "../lib/asserts.ts";
import { repeatTest } from "../../src/runner.ts";

import { Filtered } from "../../src/pickable.ts";
import { IntRequest } from "../../src/picks.ts";

import { Script } from "../../src/script_class.ts";
import { scriptFrom } from "../../src/scripts/scriptFrom.ts";
import * as arb from "@/arbs.ts";
import { filter } from "../../src/scripts/filter.ts";

describe("filter", () => {
  const sixSided = scriptFrom(new IntRequest(1, 6)).with({
    name: "sixSided",
  });

  it("disallows filters that don't allow any values through", () => {
    const rejectEverything = () => false;
    assertThrows(
      () => filter(arb.string().buildScript, rejectEverything),
      Error,
      "filter on 'string' didn't allow enough values through; want: 2 of 50, got: 0",
    );
  });

  it("keeps the default the same if it works", () => {
    const keepEverything = () => true;
    const filtered = filter(sixSided, keepEverything);
    assertValues(filtered, [1, 2, 3, 4, 5, 6]);
  });

  it("changes the default to the next value that satisfies the predicate", () => {
    const keepEvens = (n: number) => n % 2 === 0;
    const filtered = filter(sixSided, keepEvens);
    assertValues(filtered, [2, 4, 6]);
  });

  it("finds a new default when a property's default value is filtered out", () => {
    const rec = arb.object({
      a: arb.of(1, 2),
      b: arb.array(arb.boolean()),
    }).buildScript;
    const filtered = filter(rec, (r) => r.a === 2);
    assertFirstValues(filtered, [
      { b: [], a: 2 },
      { b: [false], a: 2 },
      { b: [true], a: 2 },
      { b: [false, false], a: 2 },
    ]);
  });

  it("filters out values that don't satisfy the predicate", () => {
    const not3 = filter(sixSided, (n) => n !== 3);
    repeatTest(not3, (n) => {
      assert(n !== 3, `want: not 3, got ${n}`);
    });
  });

  it("filters an arbitrary created from multiple picks", () => {
    const bit = new IntRequest(0, 1);
    const bitCount = 2;
    const accepted = new Set(["[0,1]", "[1,0]"]);

    const combos = Script.make("combos", (pick) => {
      const picks: number[] = [];
      for (let i = 0; i < bitCount; i++) {
        picks.push(pick(bit));
      }
      return JSON.stringify(picks);
    });

    const filtered = filter(combos, (pick) => accepted.has(pick));
    assertValues(filtered, ["[1,0]", "[0,1]"]);
  });

  it("works when a filter is embedded in a script", () => {
    const example = Script.make("example", (pick) => {
      const fiveSided = Script.make(
        "fiveSided",
        (pick) => pick(filter(sixSided, (n) => n !== 5)),
      );

      const excluded = pick(fiveSided);
      const filtered = filter(fiveSided, (n) => n !== excluded);

      const other = pick(filtered);
      return { excluded, other };
    });

    repeatTest(example, ({ excluded, other }) => {
      assert(excluded >= 1 && excluded <= 6, `want: 1-6, got ${excluded}}`);
      assert(other !== excluded, `want: not ${excluded}`);
    });
  });

  it("has a name by default", () => {
    const filtered = filter(sixSided, (n) => n === 2);
    assertEquals(filtered.name, "sixSided (filtered)");
  });

  it("doesn't add (filtered) twice to the name", () => {
    const filtered = filter(sixSided, (n) => n > 1);
    const twice = filter(filtered, (n) => n === 2);
    assertEquals(twice.name, "sixSided (filtered)");
  });

  it("recovers cleanly when the filtered script throws Pruned", () => {
    const original = Script.make("skip2", (pick) => {
      const n = pick(new IntRequest(1, 3));
      if (n === 2) throw new Filtered("skip 2");
      return n;
    });
    const filtered = filter(original, () => true);
    assertValues(filtered, [1, 3]);
  });

  describe("for a filtered pair", () => {
    const pair = arb.object({ a: arb.int32(), b: arb.string() }).buildScript;
    const filtered = filter(pair, (r) => r.a !== 0 && r.b !== "");
    it("always has non-default values", () => {
      repeatTest(filtered, ({ a, b }) => {
        assert(a !== 0, `want: not 0, got ${a}`);
        assert(b !== "", `want: not empty, got ${b}`);
      });
    });
  });
});
