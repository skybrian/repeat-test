#!/usr/bin/env -S deno run --allow-run --allow-env

/**
 * Check if working directory is clean; if not, run checks.
 */

async function run(cmd: string[]): Promise<boolean> {
  const command = new Deno.Command(cmd[0], {
    args: cmd.slice(1),
    stdout: "inherit",
    stderr: "inherit",
  });
  const { success } = await command.output();
  return success;
}

async function isWorkingDirectoryClean(): Promise<boolean> {
  const command = new Deno.Command("git", {
    args: ["diff", "--quiet"],
    stdout: "null",
    stderr: "null",
  });
  const { success: noUnstaged } = await command.output();

  const command2 = new Deno.Command("git", {
    args: ["diff", "--cached", "--quiet"],
    stdout: "null",
    stderr: "null",
  });
  const { success: noStaged } = await command2.output();

  return noUnstaged && noStaged;
}

async function main(): Promise<number> {
  if (await isWorkingDirectoryClean()) {
    console.log("Working directory is clean.");
    return 0;
  }

  console.log("Changes detected. Running checks...\n");

  console.log("=== Type checking ===");
  if (!await run(["deno", "check", "src/**/*.ts", "test/**/*.ts"])) {
    return 1;
  }

  console.log("\n=== Linting ===");
  if (!await run(["deno", "lint", "--ignore=examples/"])) {
    return 1;
  }

  console.log("\n=== Quick tests ===");
  const testCmd = new Deno.Command("deno", {
    args: ["test", "--allow-env"],
    stdout: "inherit",
    stderr: "inherit",
    env: { ...Deno.env.toObject(), QUICKREPS: "5" },
  });
  const { success: testSuccess } = await testCmd.output();
  if (!testSuccess) {
    return 1;
  }

  console.log("\nAll checks passed!");
  return 0;
}

Deno.exit(await main());
