#!/usr/bin/env -S deno run --allow-run --allow-read

/**
 * Pre-release checks for repeat-test.
 *
 * Verifies:
 * - Full test suite passes
 * - Bun is installed, dependencies install from the lockfile, and API tests pass
 * - Linting passes
 * - Type checking passes
 * - Examples run without errors
 * - Deno docs generate for each entrypoint
 * - Working directory is clean
 */

type CheckResult = { name: string; ok: boolean; output?: string };

type RunOptions = {
  captureOutput?: boolean;
  env?: Record<string, string>;
};

export async function run(
  cmd: string[],
  opts?: RunOptions,
): Promise<{ success: boolean; output: string; launchFailed?: boolean }> {
  try {
    const command = new Deno.Command(cmd[0], {
      args: cmd.slice(1),
      stdout: opts?.captureOutput ? "piped" : "inherit",
      stderr: opts?.captureOutput ? "piped" : "inherit",
      env: opts?.env,
    });
    const result = await command.output();
    const output = opts?.captureOutput
      ? new TextDecoder().decode(result.stdout) +
        new TextDecoder().decode(result.stderr)
      : "";
    return { success: result.success, output };
  } catch (error) {
    const output = `Could not run ${cmd.join(" ")}: ${error}`;
    if (!opts?.captureOutput) console.error(output);
    return { success: false, output, launchFailed: true };
  }
}

async function check(
  name: string,
  cmd: string[],
  opts?: RunOptions,
): Promise<CheckResult> {
  console.log(`\n=== ${name} ===`);
  const { success, output } = await run(cmd, opts);
  if (!success) {
    console.log(`FAILED`);
  }
  return { name, ok: success, output };
}

export async function checkBun(
  runCheck: typeof check = check,
): Promise<CheckResult[]> {
  const version = await runCheck("Bun Version", ["bun", "--version"]);
  if (!version.ok) {
    console.error(
      "Bun is required for release checks. Install Bun and ensure bun is on PATH.",
    );
    return [version];
  }

  const install = await runCheck("Bun Dependencies", [
    "bun",
    "install",
    "--frozen-lockfile",
  ]);
  if (!install.ok) {
    console.log(
      "Skipping Bun API tests because dependency installation failed.",
    );
    return [version, install];
  }

  const tests = await runCheck("Bun API Tests", ["bun", "run", "test:api"], {
    // Release checks must not inherit a reduced quick-test repetition budget.
    env: { REPS: "100%" },
  });
  return [version, install, tests];
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

    const { success, launchFailed } = await run([
      "deno",
      "run",
      "--allow-read",
      path,
    ], {
      captureOutput: true,
    });

    const ok = !launchFailed && (shouldFail ? !success : success);
    if (!ok) {
      console.log(
        `    FAILED${shouldFail ? " (should have failed but passed)" : ""}`,
      );
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

  // Public API compatibility under Bun (internal tests require Deno).
  results.push(...await checkBun());

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
    console.log(
      "  4. git add deno.jsonc CHANGELOG.md && git commit -m 'Release vX.Y.Z'",
    );
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

if (import.meta.main) {
  Deno.exit(await main());
}
