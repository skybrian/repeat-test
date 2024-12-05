import { describe, it } from "@std/testing/bdd";

import { assertEquals } from "@std/assert";
import { Gen } from "../../src/entrypoints/core.ts";
import { propsFromGen } from "../lib/props.ts";
import { scriptFromShape } from "../../src/scripts/scriptFromShape.ts";
import { arb } from "@/mod.ts";

describe("scriptFromShape", () => {
  it("generates an empty object for an empty shape", () => {
    const empty = scriptFromShape("empty object", {});
    assertEquals(propsFromGen(Gen.mustBuild(empty, [])), {
      val: {},
      name: "empty object",
      reqs: [],
      replies: [],
    });
  });

  it("uses no picks to generate a constant object", () => {
    const shape = {
      a: arb.of(1),
      b: arb.of(2),
    };
    const script = scriptFromShape("const", shape);
    assertEquals(propsFromGen(Gen.mustBuild(script, [])), {
      val: { a: 1, b: 2 },
      name: "const",
      reqs: [],
      replies: [],
    });
  });
});
