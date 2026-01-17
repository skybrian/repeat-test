#!/usr/bin/env -S deno run --allow-write

/**
 * Generates documentation for default values of built-in Arbitraries.
 */

import { arb } from "../src/entrypoints/mod.ts";
import { generateDefault } from "../src/ordered.ts";

type Example = {
  name: string;
  code: string;
  defaultValue: string;
};

function formatValue(val: unknown): string {
  if (typeof val === "string") {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    if (val.length === 0) return "[]";
    return JSON.stringify(val);
  }
  if (typeof val === "object" && val !== null) {
    return JSON.stringify(val);
  }
  return String(val);
}

function example(name: string, code: string, arb: { directBuild: unknown }): Example {
  const gen = generateDefault(arb);
  return {
    name,
    code,
    defaultValue: formatValue(gen.val),
  };
}

const examples: Example[] = [
  // Primitives
  example("int (positive range)", "arb.int(1, 100)", arb.int(1, 100)),
  example("int (negative range)", "arb.int(-100, -1)", arb.int(-100, -1)),
  example("int (spans zero)", "arb.int(-100, 100)", arb.int(-100, 100)),
  example("int32", "arb.int32()", arb.int32()),
  example("safeInt", "arb.safeInt()", arb.safeInt()),
  example("boolean", "arb.boolean()", arb.boolean()),
  example("biased", "arb.biased(0.9)", arb.biased(0.9)),

  // Strings
  example("string", "arb.string()", arb.string()),
  example("wellFormedString", "arb.wellFormedString()", arb.wellFormedString()),
  example("asciiLetter", "arb.asciiLetter()", arb.asciiLetter()),
  example("asciiDigit", "arb.asciiDigit()", arb.asciiDigit()),
  example("asciiWhitespace", "arb.asciiWhitespace()", arb.asciiWhitespace()),
  example("char16", "arb.char16()", arb.char16()),
  example("unicodeChar", "arb.unicodeChar()", arb.unicodeChar()),

  // Collections
  example("array", "arb.array(arb.int(0, 10))", arb.array(arb.int(0, 10))),
  example("array (fixed length)", "arb.array(arb.int(0, 10), { length: 3 })", arb.array(arb.int(0, 10), { length: 3 })),
  example("object", "arb.object({ a: arb.int(1, 5), b: arb.boolean() })", arb.object({ a: arb.int(1, 5), b: arb.boolean() })),

  // Combinators
  example("of", "arb.of(\"a\", \"b\", \"c\")", arb.of("a", "b", "c")),
  example("oneOf", "arb.oneOf(arb.of(1), arb.of(2), arb.of(3))", arb.oneOf(arb.of(1), arb.of(2), arb.of(3))),
];

function generateMarkdown(examples: Example[]): string {
  const lines: string[] = [
    "# Default Values for Built-in Arbitraries",
    "",
    "Every Arbitrary has a default value. When `repeatTest` runs, it tests the",
    "default value first as a smoke test before generating random values.",
    "",
    "This table shows the default values for common Arbitraries:",
    "",
    "| Arbitrary | Code | Default Value |",
    "|-----------|------|---------------|",
  ];

  for (const ex of examples) {
    lines.push(`| ${ex.name} | \`${ex.code}\` | \`${ex.defaultValue}\` |`);
  }

  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push("- `arb.int(min, max)`: Default is `min` for positive ranges, `-1` for negative ranges, or `0` if the range spans zero.");
  lines.push("- `arb.boolean()`: Default is `false`.");
  lines.push("- `arb.string()` and other string arbitraries: Default is the empty string `\"\"`.");
  lines.push("- `arb.array(...)`: Default is an empty array `[]`, unless a fixed length is specified.");
  lines.push("- `arb.of(...)`: Default is the first value.");
  lines.push("- `arb.oneOf(...)`: Default comes from the first case.");
  lines.push("- `arb.object(...)`: Default has each property set to its arbitrary's default.");
  lines.push("");
  lines.push("When writing custom Arbitraries with `arb.from()`, the default is determined by");
  lines.push("each nested `pick()` call returning its own default value.");
  lines.push("");

  return lines.join("\n");
}

const markdown = generateMarkdown(examples);

if (Deno.args.includes("--check")) {
  // Check mode: compare with existing file
  const existingContent = await Deno.readTextFile("docs/defaults.md").catch(() => "");
  if (existingContent !== markdown) {
    console.error("docs/defaults.md is out of date. Run: deno task generate-defaults");
    Deno.exit(1);
  }
  console.log("docs/defaults.md is up to date.");
} else {
  // Generate mode: write the file
  await Deno.writeTextFile("docs/defaults.md", markdown);
  console.log("Generated docs/defaults.md");
}
