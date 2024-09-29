import type { PickSet } from "../src/generated.ts";

import { assert } from "@std/assert/assert";
import { assertEquals } from "@std/assert/equals";
import { beforeEach, describe, it } from "@std/testing/bdd";
import { minPlayout } from "../src/backtracking.ts";
import { generate } from "../src/generated.ts";
import { noChange, PickRequest } from "../src/picks.ts";
import { RecordingConsole } from "../src/console.ts";
import * as arb from "../src/entrypoints/arbs.ts";
import { Gen } from "../src/gen_class.ts";
import { equal } from "@std/assert/equal";

const frozen: PickSet<readonly string[]> = {
  label: "frozen",
  generateFrom: () => Object.freeze(["frozen"]),
};

const mutable: PickSet<string[]> = {
  label: "mutable",
  generateFrom: () => ["mutable"],
};

describe("Gen", () => {
  describe("val", () => {
    it("doesn't regenerate a frozen object", () => {
      const gen = generate(frozen, minPlayout());
      assert(gen !== undefined);
      const val = gen.val;
      assertEquals(val, ["frozen"]);
      assert(gen.val === val);
    });

    it("regenerates a mutable object", () => {
      const gen = generate(mutable, minPlayout());
      assert(gen !== undefined);
      const val = gen.val;
      assertEquals(val, ["mutable"]);
      assert(gen.val !== val);
    });
  });

  describe("mutate", () => {
    it("does nothing if there are no edits", () => {
      const gen = generate(frozen, minPlayout());
      assert(gen !== undefined);
      assertEquals(gen.mutate(noChange), undefined);
    });
  });

  describe("logTo", () => {
    let con = new RecordingConsole();

    beforeEach(() => {
      con = new RecordingConsole();
    });

    it("logs to a console", () => {
      const input = arb.from((pick) => {
        return pick(arb.int(1, 10));
      });
      const gen = generate(input, minPlayout());
      assert(gen !== undefined);
      gen.playout.logTo(con);
      con.logged(["0: 1..10 =>", 1]);
      con.checkEmpty();
    });
  });

  const bit = new PickRequest(0, 1);
  const hi: PickSet<string> = {
    label: "hi",
    generateFrom: () => "hi",
  };

  it("compares differently with different replies", () => {
    const a = new Gen(hi, [bit], [0], undefined, "hi");
    const b = new Gen(hi, [bit], [1], undefined, "hi");
    assert(!equal(a, b));
  });
});
