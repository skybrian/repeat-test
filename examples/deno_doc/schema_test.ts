import { describe, it } from "@std/testing/bdd";
import { denoDoc } from "./schema.ts";

import arbEntry from "./data/arbitrary_0.4.json" with { type: "json" };
import runEntry from "./data/runner_0.4.json" with { type: "json" };

describe("schema", () => {
  it("can parse 'arbitrary' entry point", () => {
    denoDoc.parse(arbEntry);
  });
  it("can parse 'runner' entry point", () => {
    denoDoc.parse(runEntry);
  });
});
