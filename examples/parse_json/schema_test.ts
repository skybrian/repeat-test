import { describe, it } from "@std/testing/bdd";
import { schema } from "./schema.ts";

import denoDocOutput from "./arbitrary_0.4.json" with { type: "json" };

describe("schema", () => {
  it("can parse deno doc output", () => {
    schema.parse(denoDocOutput);
  });
});
