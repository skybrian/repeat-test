import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertStringIncludes } from "@std/assert";
import { stub } from "@std/testing/mock";

import { checkBun, run } from "../../scripts/release-check.ts";

describe("Bun release checks", () => {
  for (
    const failAt of [
      undefined,
      "Bun Version",
      "Bun Dependencies",
      "Bun API Tests",
    ]
  ) {
    it(`runs required checks in order (failure: ${failAt ?? "none"})`, async () => {
      const calls: unknown[] = [];
      const results = await checkBun((name, cmd, opts) => {
        calls.push({ name, cmd, opts });
        return Promise.resolve({ name, ok: name !== failAt });
      });

      const expected = [
        { name: "Bun Version", cmd: ["bun", "--version"], opts: undefined },
        {
          name: "Bun Dependencies",
          cmd: ["bun", "install", "--frozen-lockfile"],
          opts: undefined,
        },
        {
          name: "Bun API Tests",
          cmd: ["bun", "run", "test:api"],
          opts: { env: { REPS: "100%" } },
        },
      ];
      const count = failAt === "Bun Version"
        ? 1
        : failAt === "Bun Dependencies"
        ? 2
        : 3;
      assertEquals(calls, expected.slice(0, count));
      assertEquals(
        results,
        expected.slice(0, count).map(({ name }) => ({
          name,
          ok: name !== failAt,
        })),
      );
    });
  }
});

describe("release command errors", () => {
  it("reports launch failures instead of throwing", async () => {
    using _command = stub(Deno.Command.prototype, "output", () => {
      return Promise.reject(new Deno.errors.NotFound("executable not found"));
    });
    const result = await run(["missing-tool", "--version"], {
      captureOutput: true,
    });
    assertEquals(result.success, false);
    assertEquals(result.launchFailed, true);
    assertStringIncludes(result.output, "Could not run missing-tool --version");
    assertStringIncludes(result.output, "executable not found");
  });
});
