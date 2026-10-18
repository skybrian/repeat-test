import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";

import { filtered } from "../src/results.ts";
import { IntRequest } from "../src/picks.ts";
import { neverReturns, Script } from "../src/script_class.ts";
import { usePicks } from "./lib/picks.ts";

const bool = Script.make("bool", (pick) => pick(IntRequest.bit) === 1);

describe("Script", () => {
  it("the internal neverReturns placeholder rejects every playout", () => {
    assertEquals(neverReturns.run(usePicks()), filtered);
  });

  describe("run", () => {
    it("returns filtered for an invalid pick", () => {
      assertEquals(bool.run(usePicks(3)), filtered);
    });
  });
});
