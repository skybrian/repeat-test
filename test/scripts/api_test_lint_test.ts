import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertStringIncludes } from "@std/assert";

import plugin from "../../scripts/api_test_lint.ts";
import manifest from "../../package.json" with { type: "json" };

const projectRoot = new URL("../../", import.meta.url);
const ruleId = "repeat-test/api-import-boundary";

function lint(
  source: string,
  filename = "test/api/example_test.ts",
): Deno.lint.Diagnostic[] {
  return Deno.lint.runPlugin(
    plugin,
    new URL(filename, projectRoot).pathname,
    source,
  );
}

function assertRejected(source: string, filename?: string): void {
  const diagnostics = lint(source, filename);
  assertEquals(diagnostics.length, 1);
  assertEquals(diagnostics[0].id, ruleId);
}

describe("API import boundary lint", () => {
  for (const entry of Object.keys(manifest.exports)) {
    const specifier = entry === "."
      ? manifest.name
      : `${manifest.name}/${entry.slice(2)}`;
    it(`allows published entry point ${specifier}`, () => {
      assertEquals(lint(`import * as api from "${specifier}";`), []);
    });
  }

  for (
    const specifier of [
      "node:test",
      "node:assert",
      "node:assert/strict",
      "./support/asserts.ts",
      "./support/../support/asserts.ts",
    ]
  ) {
    it(`allows ${specifier}`, () => {
      assertEquals(lint(`import * as helper from "${specifier}";`), []);
    });
  }

  it("allows parent-relative imports that remain inside the API suite", () => {
    assertEquals(
      lint(
        'import { helper } from "../support/asserts.ts";',
        "test/api/domains/strings_test.ts",
      ),
      [],
    );
  });

  it("allows supported module syntax", () => {
    assertEquals(
      lint(`
        import type { Domain } from "@skybrian/repeat-test/core";
        export { helper } from "./support/asserts.ts";
        export * from "./support/console.ts";
        export type { Helper } from "./support/asserts.ts";
        type DomainType = import("@skybrian/repeat-test/core").Domain<number>;
        const api = import("@skybrian/repeat-test");
        export const local = 123;
      `),
      [],
    );
  });

  for (
    const specifier of [
      "../../src/gen_class.ts",
      "../../src/entrypoints/mod.ts",
      "../lib/asserts.ts",
      "./support/../../lib/asserts.ts",
      "../api-other/helper.ts",
      "./%2e%2e%2flib/asserts.ts",
      "@/core.ts",
      "@std/assert",
      "@std/testing/bdd",
      "@skybrian/repeat-test/src/frozen.ts",
      "@skybrian/repeat-test/unknown",
      "jsr:@skybrian/repeat-test",
      "npm:@skybrian/repeat-test",
      "bun:test",
      "node:module",
      "https://example.com/helper.ts",
      "/tmp/helper.ts",
      "file:///tmp/helper.ts",
    ]
  ) {
    it(`rejects ${specifier}`, () => {
      assertRejected(`import * as helper from "${specifier}";`);
    });
  }

  for (
    const source of [
      'import "../../src/frozen.ts";',
      'import type { Pickable } from "../../src/pickable.ts";',
      'export { frozen } from "../../src/frozen.ts";',
      'export * from "../../src/frozen.ts";',
      'export type { Pickable } from "../../src/pickable.ts";',
      'type PickableType = import("../../src/pickable.ts").Pickable<number>;',
      'const api = import("../../src/entrypoints/mod.ts");',
    ]
  ) {
    it(`checks ${source}`, () => {
      assertRejected(source);
    });
  }

  it("checks support files, not just test files", () => {
    assertRejected(
      'export { RecordingConsole } from "../../lib/console.ts";',
      "test/api/support/console.ts",
    );
  });

  for (
    const source of [
      "const api = import(moduleName);",
      'const api = import("@skybrian/" + "repeat-test");',
      "const api = import(`@skybrian/repeat-test`);",
      'const api = require("@skybrian/repeat-test");',
      'const api = module.require("@skybrian/repeat-test");',
      'const api = module["require"]("@skybrian/repeat-test");',
      'const path = require.resolve("@skybrian/repeat-test");',
      'import api = require("@skybrian/repeat-test");',
    ]
  ) {
    it(`rejects unchecked loading: ${source}`, () => {
      assertRejected(source);
    });
  }

  it("explains how to fix a disallowed import", () => {
    const [diagnostic] = lint('import { frozen } from "../../src/frozen.ts";');
    assertStringIncludes(diagnostic.message, "../../src/frozen.ts");
    assertStringIncludes(diagnostic.hint ?? "", "published");
    assertEquals(diagnostic.range, [23, 44]);
  });

  for (
    const filename of [
      "test/runner_test.ts",
      "test/lib/asserts.ts",
      "test/api-other/example_test.ts",
      "src/entrypoints/mod.ts",
    ]
  ) {
    it(`does not restrict ${filename}`, () => {
      assertEquals(lint('import { helper } from "@/core.ts";', filename), []);
    });
  }
});
