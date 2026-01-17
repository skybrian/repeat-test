#!/usr/bin/env -S deno run --allow-run --allow-read

/**
 * Pre-release checks for repeat-test.
 *
 * Verifies:
 * - Full test suite passes
 * - Linting passes
 * - Type checking passes
 * - Examples run without errors
 * - Deno docs generate for each entrypoint
 * - Working directory is clean
 */

type CheckResult = { name: string; ok: boolean; output?: string };

async function run(
  cmd: string[],
  opts?: { captureOutput?: boolean },
): Promise<{ success: boolean; output: string }> {
  const command = new Deno.Command(cmd[0], {
    args: cmd.slice(1),
    stdout: opts?.captureOutput ? "piped" : "inherit",
    stderr: opts?.captureOutput ? "piped" : "inherit",
  });
  const result = await command.output();
  const output = opts?.captureOutput
    ? new TextDecoder().decode(result.stdout) +
      new TextDecoder().decode(result.stderr)
    : "";
  return { success: result.success, output };
}

async function check(
  name: string,
  cmd: string[],
  opts?: { captureOutput?: boolean },
): Promise<CheckResult> {
  console.log(`\n=== ${name} ===`);
  const { success, output } = await run(cmd, opts);
  if (!success) {
    console.log(`FAILED`);
  }
  return { name, ok: success, output };
}

async function checkExamples(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const examplesDir = "examples";

  // Examples that are designed to fail (demonstrating bug detection)
  const expectedToFail = new Set(["split.ts"]);

  console.log(`\n=== Examples ===`);

  for await (const entry of Deno.readDir(examplesDir)) {
    if (!entry.isFile || !entry.name.endsWith(".ts")) continue;
    if (entry.name.endsWith("_test.ts")) continue; // Skip test files, run separately

    const path = `${examplesDir}/${entry.name}`;
    const shouldFail = expectedToFail.has(entry.name);
    console.log(`  ${entry.name}${shouldFail ? " (expected to fail)" : ""}...`);

    const { success } = await run(["deno", "run", "--allow-read", path], {
      captureOutput: true,
    });

    const ok = shouldFail ? !success : success;
    if (!ok) {
      console.log(`    FAILED${shouldFail ? " (should have failed but passed)" : ""}`);
    }
    results.push({ name: `example: ${entry.name}`, ok });
  }

  // Run example tests
  console.log(`  example tests...`);
  const { success } = await run(["deno", "test", "examples/"], {
    captureOutput: true,
  });
  if (!success) {
    console.log(`    FAILED`);
  }
  results.push({ name: "example tests", ok: success });

  return results;
}

async function checkDenoDocs(): Promise<CheckResult> {
  console.log(`\n=== Deno Doc Lint ===`);

  // Must pass all entrypoints in one call due to:
  // https://github.com/denoland/deno/issues/25188
  // Use bash for glob expansion
  const { success } = await run(
    ["bash", "-c", "deno doc --lint src/entrypoints/*.ts"],
  );

  if (!success) {
    console.log(`FAILED`);
  }
  return { name: "deno doc --lint", ok: success };
}

async function isWorkingDirectoryClean(): Promise<boolean> {
  const { success: noUnstaged } = await run(["git", "diff", "--quiet"], {
    captureOutput: true,
  });
  const { success: noStaged } = await run(
    ["git", "diff", "--cached", "--quiet"],
    { captureOutput: true },
  );
  return noUnstaged && noStaged;
}

async function main(): Promise<number> {
  console.log("Running pre-release checks...\n");

  const results: CheckResult[] = [];

  // Full test suite
  results.push(await check("Full Test Suite", ["deno", "test"]));

  // Linting
  results.push(
    await check("Linting", ["deno", "lint", "--ignore=examples/"]),
  );

  // Type checking
  results.push(
    await check("Type Checking", [
      "deno",
      "check",
      "src/**/*.ts",
      "test/**/*.ts",
    ]),
  );

  // Examples
  results.push(...await checkExamples());

  // Deno doc lint
  results.push(await checkDenoDocs());

  // Doc examples type-check
  results.push(
    await check("Doc Examples", [
      "deno",
      "run",
      "--allow-read",
      "--allow-write",
      "--allow-run",
      "scripts/check_doc_examples.ts",
    ]),
  );

  // Working directory clean
  console.log(`\n=== Working Directory ===`);
  const clean = await isWorkingDirectoryClean();
  if (clean) {
    console.log("Clean");
  } else {
    console.log("DIRTY - uncommitted changes");
  }
  results.push({ name: "working directory clean", ok: clean });

  // Summary
  console.log(`\n${"-".repeat(50)}`);
  console.log("SUMMARY\n");

  const failed = results.filter((r) => !r.ok);
  const passed = results.filter((r) => r.ok);

  if (failed.length === 0) {
    console.log(`All ${results.length} checks passed!\n`);
    console.log("Ready to release. Next steps:");
    console.log("  1. Update version in deno.jsonc");
    console.log("  2. Update CHANGELOG.md (rename Unreleased to version)");
    console.log("  3. deno publish --dry-run");
    console.log("  4. git add deno.jsonc CHANGELOG.md && git commit -m 'Release vX.Y.Z'");
    console.log("  5. git tag vX.Y.Z");
    console.log("  6. git push origin main --tags");
    console.log("  7. deno publish");
    return 0;
  } else {
    console.log(`${passed.length} passed, ${failed.length} failed:\n`);
    for (const r of failed) {
      console.log(`  ✗ ${r.name}`);
    }
    console.log("\nFix the above issues before releasing.");
    return 1;
  }
}

Deno.exit(await main());
