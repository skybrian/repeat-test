# Testing Documentation Code Examples

This document describes how to verify that code examples in the documentation
type-check correctly.

## Quick Start

```bash
deno task check-docs          # Type-check all doc examples
deno task check-docs --verbose # Show the concatenated code
```

## How It Works

The `scripts/check_doc_examples.ts` script:

1. Extracts all ` ```ts ` code blocks from each markdown file
2. Merges all imports (deduplicating by source module)
3. Concatenates all code blocks into a single file
4. Runs `deno check` on the result

This approach works because documentation examples typically build on each
other, with earlier blocks defining imports that later blocks use.

## Writing Testable Documentation

### Avoid Variable Name Conflicts

When showing multiple examples that define the same variable, use different
names. This allows all blocks to concatenate without redeclaration errors.

**Instead of:**
```markdown
Here's one way:
` ` `ts
const examples = ["hello", "world"];
` ` `

Here's another way:
` ` `ts
const examples = arb.of("hello", "world");  // ERROR: redeclares 'examples'
` ` `
```

**Do this:**
```markdown
Here's one way:
` ` `ts
const arrayExamples = ["hello", "world"];
` ` `

Here's another way:
` ` `ts
const arbExamples = arb.of("hello", "world");  // OK: different name
` ` `
```

### Use doc-imports for Cross-Page Context

If a documentation page assumes imports from earlier pages in a series, add
them in an HTML comment at the top of the file:

```markdown
# Part 3: Advanced Topics

<!-- doc-imports
import { assert } from "@std/assert";
import { arb, repeatTest } from "@skybrian/repeat-test";
-->

## First Section

Now you can use `repeatTest` without importing it in each block...
```

### Skip Non-Testable Blocks

For code blocks that shouldn't be type-checked (e.g., showing invalid syntax,
pseudocode, or shell commands), use the `ignore` modifier:

```markdown
` ` `ts ignore
// This is conceptual, not real code
someFunction(magic);
` ` `
```

## Adding to CI

Add to your `deno.jsonc`:

```json
{
  "tasks": {
    "check-docs": "deno run --allow-read --allow-write --allow-run scripts/check_doc_examples.ts"
  }
}
```
