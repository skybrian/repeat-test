#!/usr/bin/env -S deno run --allow-run --allow-read --allow-write=coverage --allow-env=REPS

/** Collect comparable coverage reports. Run through the tasks in deno.jsonc. */
import { fileURLToPath } from "node:url";
import {
  compareCoverage,
  formatSummary,
  parseLcov,
} from "./coverage_report.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifestPath = "coverage/comparison.json";
const refresh = "deno task coverage:compare";

interface Manifest {
  version: 1;
  created: string;
  deno: string;
  reps: string;
  inputs: Record<string, string>;
}

async function digest(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(
    new Uint8Array(hash),
    (b) => b.toString(16).padStart(2, "0"),
  )
    .join("");
}

/** Hash contents, not mtimes: edits, additions, and deletions invalidate reports. */
async function snapshot(): Promise<Record<string, string>> {
  const paths: string[] = [];
  async function walk(dir: string) {
    for await (const entry of Deno.readDir(dir)) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory) await walk(path);
      else if (entry.isFile && /\.[cm]?[jt]sx?$/.test(entry.name)) {
        paths.push(path);
      }
    }
  }
  for (const dir of ["src", "test", "examples", "scripts"]) await walk(dir);
  paths.push("deno.jsonc", "deno.lock", "package.json", "tsconfig.json");
  const inputs: Record<string, string> = {};
  for (const path of paths.sort()) {
    inputs[path] = await digest(await Deno.readFile(path));
  }
  return inputs;
}

async function run(args: string[]) {
  const child = new Deno.Command(Deno.execPath(), {
    args,
    stdout: "inherit",
    stderr: "inherit",
  }).spawn();
  if (!(await child.status).success) {
    throw new Error(`Failed: deno ${args.join(" ")}`);
  }
}

async function collect() {
  await Deno.mkdir("coverage", { recursive: true });
  // A failed refresh must not leave a manifest claiming mixed reports are valid.
  try {
    await Deno.remove(manifestPath);
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
  const inputs = await snapshot();
  const reps = Deno.env.get("REPS") ?? "100%";
  for (const suite of ["api", "all"]) {
    const dir = `coverage/${suite}`;
    console.log(`\n=== Collecting ${suite} coverage (REPS=${reps}) ===`);
    await run([
      "test",
      `--coverage=${dir}`,
      "--clean",
      "--coverage-raw-data-only",
      "--allow-env=REPS",
      ...(suite === "api" ? ["test/api/"] : []),
    ]);
    // Anchor the include filter to this checkout; dependencies/tests stay out.
    const sourceURL = new URL("../src/", import.meta.url).href;
    const include = "^" + sourceURL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const filters = [
      `--include=${include}`,
      "--exclude=coverage_exclusions.ts",
    ];
    await run([
      "coverage",
      ...filters,
      "--lcov",
      `--output=${dir}/lcov.info`,
      dir,
    ]);
    await run(["coverage", ...filters, "--html", dir]);
  }
  if (JSON.stringify(inputs) !== JSON.stringify(await snapshot())) {
    throw new Error(`Inputs changed during collection. Run ${refresh} again.`);
  }
  const manifest: Manifest = {
    version: 1,
    created: new Date().toISOString(),
    deno: Deno.version.deno,
    reps,
    inputs,
  };
  await Deno.writeTextFile(
    manifestPath,
    JSON.stringify(manifest, null, 2) + "\n",
  );
  console.log("\nSaved coverage/{api,all}/lcov.info and HTML reports.");
  console.log("\n" + formatSummary(await readReports()));
}

async function readReports() {
  const read = async (suite: string) =>
    parseLcov(
      await Deno.readTextFile(`coverage/${suite}/lcov.info`),
      root,
    );
  return compareCoverage(await read("api"), await read("all"));
}

async function main() {
  Deno.chdir(root);
  const [command, ...args] = Deno.args;
  if (command !== "compare" || args.length) {
    throw new Error(`Usage: ${refresh}`);
  }
  await collect();
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    Deno.exitCode = 1;
  }
}
