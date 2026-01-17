#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run
/**
 * Documentation Example Checker
 *
 * Verifies that code examples in markdown documentation type-check correctly
 * by concatenating all code blocks in each file into a single TypeScript file.
 *
 * ## How it works
 *
 * 1. Extracts all ```ts/```typescript code blocks from each markdown file
 * 2. Extracts any <!-- doc-imports --> for page-level imports
 * 3. Merges all imports (deduplicating by source)
 * 4. Concatenates all code blocks
 * 5. Type-checks the result
 *
 * ## Usage
 *
 *   deno task check-docs              # Type-check all .md files
 *   deno task check-docs --verbose    # Show the concatenated code
 *   deno task check-docs file.md      # Check specific file(s)
 *
 * ## Writing testable documentation
 *
 * To make documentation code blocks work with this checker:
 *
 * 1. **Avoid variable name conflicts**: When showing multiple examples that
 *    define the same variable, use different names (e.g., `arrayExamples`,
 *    `mixedExamples` instead of reusing `examples`).
 *
 * 2. **Use doc-imports for cross-page context**: If a doc assumes imports
 *    from earlier pages in a series, add them at the top:
 *
 *    ```markdown
 *    <!-- doc-imports
 *    import { something } from "somewhere";
 *    -->
 *    ```
 *
 * 3. **Use `ignore` for non-runnable snippets**: Mark blocks that shouldn't
 *    be checked with ```ts ignore or ```typescript ignore
 *
 * ## Modifiers
 *
 * - ```ts ignore - Skip this block entirely
 * - ```typescript ignore - Same as above
 */

import { walk } from "@std/fs/walk";

function extractAndConcatenate(content: string): {
  code: string;
  blockCount: number;
  skipped: number;
} {
  // Extract doc-imports from HTML comment
  const docImportsMatch = content.match(/<!--\s*doc-imports\s*([\s\S]*?)-->/);
  const docImports = docImportsMatch
    ? docImportsMatch[1]
        .trim()
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l)
    : [];

  // Extract code blocks
  const blocks: string[] = [];
  const lines = content.split("\n");
  let inBlock = false;
  let skip = false;
  let blockLines: string[] = [];
  let skipped = 0;

  for (const line of lines) {
    if (!inBlock && line.match(/^```(?:ts|typescript)/)) {
      inBlock = true;
      skip = line.includes("ignore");
      blockLines = [];
    } else if (inBlock && line === "```") {
      inBlock = false;
      if (skip) {
        skipped++;
      } else {
        blocks.push(blockLines.join("\n"));
      }
    } else if (inBlock) {
      blockLines.push(line);
    }
  }

  // Parse and merge imports by source module
  const importsBySource = new Map<string, Set<string>>();

  function parseImport(line: string): void {
    const match = line.match(
      /import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["']/,
    );
    if (match) {
      const items = match[1].split(",").map((s) => s.trim());
      const source = match[2];
      if (!importsBySource.has(source)) {
        importsBySource.set(source, new Set());
      }
      items.forEach((item) => importsBySource.get(source)!.add(item));
    }
  }

  // Process doc-imports first
  for (const imp of docImports) {
    parseImport(imp);
  }

  // Process each block
  const allCode: string[] = [];
  for (const block of blocks) {
    const blockLines = block.split("\n");

    for (const line of blockLines) {
      if (line.trim().startsWith("import ")) {
        parseImport(line);
      }
    }

    const code = blockLines
      .filter((l) => !l.trim().startsWith("import "))
      .join("\n")
      .trim();
    if (code) {
      allCode.push(code);
    }
  }

  // Generate merged imports, sorting type imports last
  const mergedImports: string[] = [];
  for (const [source, items] of importsBySource) {
    const sortedItems = [...items].sort((a, b) => {
      const aIsType = a.startsWith("type ");
      const bIsType = b.startsWith("type ");
      if (aIsType !== bIsType) return aIsType ? 1 : -1;
      return a.localeCompare(b);
    });
    mergedImports.push(`import { ${sortedItems.join(", ")} } from "${source}";`);
  }

  return {
    code: [...mergedImports, "", ...allCode].join("\n"),
    blockCount: blocks.length,
    skipped,
  };
}

async function typeCheck(code: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  const tempFile = await Deno.makeTempFile({ suffix: ".ts" });

  try {
    await Deno.writeTextFile(tempFile, code);

    const cmd = new Deno.Command("deno", {
      args: ["check", tempFile],
      stdout: "piped",
      stderr: "piped",
    });

    const result = await cmd.output();

    if (result.code === 0) {
      return { ok: true };
    } else {
      return {
        ok: false,
        error: new TextDecoder().decode(result.stderr),
      };
    }
  } finally {
    await Deno.remove(tempFile);
  }
}

async function checkDocFile(
  filePath: string,
  verbose: boolean,
): Promise<boolean> {
  const content = await Deno.readTextFile(filePath);
  const { code, blockCount, skipped } = extractAndConcatenate(content);

  // Skip files with no code blocks
  if (blockCount === 0 && skipped === 0) {
    return true;
  }

  console.log(`\n📄 ${filePath}`);
  console.log(`   ${blockCount} blocks${skipped > 0 ? `, ${skipped} skipped` : ""}`);

  if (verbose) {
    console.log("\n   Concatenated code:");
    console.log(code.split("\n").map((l) => `   │ ${l}`).join("\n"));
    console.log();
  }

  // If all blocks were skipped, that's fine
  if (blockCount === 0) {
    console.log(`   ✅ All blocks skipped`);
    return true;
  }

  const result = await typeCheck(code);

  if (result.ok) {
    console.log(`   ✅ Type-check passed`);
    return true;
  } else {
    console.log(`   ❌ Type-check failed`);
    const errorLines = result.error
      ?.split("\n")
      .slice(0, 8)
      .map((l) => `   ${l}`)
      .join("\n");
    console.log(errorLines);
    return false;
  }
}

async function findMarkdownFiles(): Promise<string[]> {
  const files: string[] = [];
  for await (const entry of walk(".", {
    exts: [".md"],
    skip: [/node_modules/, /\.git/],
  })) {
    if (entry.isFile) {
      files.push(entry.path);
    }
  }
  return files.sort();
}

async function main() {
  const args = Deno.args;
  const verbose = args.includes("--verbose");
  let files = args.filter((a) => !a.startsWith("--"));

  if (files.length === 0) {
    // Default: find all .md files
    files = await findMarkdownFiles();
  }

  console.log(`🔍 Checking documentation examples`);

  let allPassed = true;
  let checkedCount = 0;

  for (const file of files) {
    try {
      const content = await Deno.readTextFile(file);
      const { blockCount, skipped } = extractAndConcatenate(content);
      
      // Only count files that have code blocks
      if (blockCount > 0 || skipped > 0) {
        checkedCount++;
      }
      
      const passed = await checkDocFile(file, verbose);
      if (!passed) allPassed = false;
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) {
        console.log(`\n📄 ${file}`);
        console.log(`   ❌ File not found`);
        allPassed = false;
      } else {
        console.log(`\n📄 ${file}`);
        console.log(`   ❌ Error: ${e instanceof Error ? e.message : e}`);
        allPassed = false;
      }
    }
  }

  if (checkedCount === 0) {
    console.log("\n   No TypeScript code blocks found in any files.");
  }

  console.log(`\n${"═".repeat(50)}`);
  console.log(
    allPassed
      ? "✅ All documentation checks passed"
      : "❌ Some checks failed",
  );

  if (!allPassed) {
    Deno.exit(1);
  }
}

main();
