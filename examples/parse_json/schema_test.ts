import { describe, it } from "@std/testing/bdd";
import { schema } from "./schema.ts";

import arbEntry from "./arbitrary_0.4.json" with { type: "json" };
import runEntry from "./runner_0.4.json" with { type: "json" };

describe("schema", () => {
  it("can parse arbitrary entry point", () => {
    schema.parse(arbEntry);
  });
  it("can parse arbitrary entry point", () => {
    schema.parse(runEntry);
  });
});
