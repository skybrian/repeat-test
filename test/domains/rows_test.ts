import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals } from "@std/assert";

import * as dom from "@/doms.ts";

import { assertEncoding, assertSometimes } from "../lib/asserts.ts";
import { propsFromGen } from "../lib/props.ts";
import { patternsFromDomain } from "../../src/domains/rows.ts";

describe("object", () => {
  const anyObject = dom.object({});

  describe("regenerate", () => {
    it("generates no picks for an empty object", () => {
      assertEncoding(anyObject, [], {});
    });

    it("generates no picks for an ignored property", () => {
      const gen = anyObject.regenerate({ "extra": true });
      assert(gen.ok);
      assertEquals(propsFromGen(gen), {
        val: {},
        name: "empty object",
        reqs: [],
        replies: [],
      });
    });

    it("generates no picks for a constant property", () => {
      const constObject = dom.object({ a: dom.of(0) });
      assertEncoding(constObject, [], { a: 0 });
    });
  });

  it("encodes objects as a sequence of encoded properties", () => {
    const shape = {
      a: dom.int(0, 1),
      b: dom.int(1, 6),
    };
    const rec = dom.object(shape);
    assertEncoding(rec, [1, 6], { a: 1, b: 6 });
  });
});

describe("taggedUnion", () => {
  it("chooses evenly between two patterns", () => {
    const ab = dom.taggedUnion("kind", [
      dom.object({ kind: dom.of("a") }),
      dom.object({ kind: dom.of("b") }),
    ]);
    assertSometimes(ab, (v) => v.kind === "a", 45, 55);
  });

  it("chooses the pattern with more weight more often", () => {
    const ab = dom.taggedUnion("kind", [
      dom.object({ kind: dom.of("a") }),
      dom.object({ kind: dom.of("b") }).with({ weight: 3 }),
    ]);
    assertEquals(ab.buildScript.weight, 1);

    const patterns = patternsFromDomain(ab);
    assertEquals(patterns[0].weight, 1);
    assertEquals(patterns[1].weight, 3);
    assertSometimes(ab, (v) => v.kind === "b", 70, 80);
  });
});
