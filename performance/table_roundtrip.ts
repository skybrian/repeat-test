/**
 * Reproduce the API test's table round trip with a fixed seed in either runtime.
 *
 * deno run performance/table_roundtrip.ts [random reps] [seed] [variant] [mode]
 * bun run performance/table_roundtrip.ts  [random reps] [seed] [variant] [mode]
 *
 * Variants: original, short-strings, no-strings, short-tables.
 * Modes: full (real runner), generate (no round trip), phases (timed steps).
 *
 * Uses internal runner entry points only to fix the seed; it does not change
 * REPS or pick a new seed. Each run starts cold, without a warmup or coverage.
 */
import assert from "node:assert/strict";
import { argv, versions } from "node:process";
import { Arbitrary, Gen } from "../src/entrypoints/core.ts";
import * as dom from "../src/entrypoints/doms.ts";
import { generateReps, RepSource, runReps } from "../src/runner.ts";
import { assertRoundTrip } from "../test/api/support/asserts.ts";

const [
  countArg = "1000",
  seedArg = "123",
  variant = "original",
  mode = "full",
] = argv.slice(2);
const randomReps = Number(countArg);
const seed = Number(seedArg);
assert(Number.isSafeInteger(randomReps) && randomReps >= 0);
assert(Number.isSafeInteger(seed) && seed >= 0 && seed <= 0x7fffffff);
assert(
  ["original", "short-strings", "no-strings", "short-tables"].includes(variant),
);
assert(["full", "generate", "phases"].includes(mode));

type Row =
  | { id: number; kind: "number"; value: number }
  | { id: number; kind: "string"; value: string };

const setupStart = performance.now();
const id = dom.int(1, 10);
const value = variant === "no-strings" ? dom.of("") : dom.string(
  variant === "short-strings" ? { length: { max: 16 } } : undefined,
);
const row = dom.taggedUnion<Row>("kind", [
  dom.object<Row>({ id, kind: dom.of("string"), value }),
  dom.object<Row>({ id, kind: dom.of("number"), value: dom.int(1, 10) }),
]);
const table = dom.table(row, {
  keys: ["id"],
  ...(variant === "short-tables" ? { length: { max: 3 } } : {}),
});
const setupMs = performance.now() - setupStart;
const stats = {
  tables: 0,
  rows: 0,
  strings: 0,
  codeUnits: 0,
  maxRows: 0,
  maxString: 0,
};
function observe(rows: Row[]) {
  stats.tables++;
  stats.rows += rows.length;
  stats.maxRows = Math.max(stats.maxRows, rows.length);
  for (const row of rows) {
    if (row.kind === "string") {
      stats.strings++;
      stats.codeUnits += row.value.length;
      stats.maxString = Math.max(stats.maxString, row.value.length);
    }
  }
}

const reps = generateReps(
  [
    new RepSource(0, Arbitrary.from(table), (rows) => {
      if (mode === "full") assertRoundTrip(table, rows);
      observe(rows);
    }, seed),
  ],
  seed,
  { limit: 10_000 },
);

const phases = {
  generateMs: 0,
  originalValueMs: 0,
  pickifyMs: 0,
  buildMs: 0,
  rebuiltValueMs: 0,
  equalityMs: 0,
};
let pickCount = 0;
const start = performance.now();
if (mode !== "phases") {
  const result = runReps(reps, randomReps + 1, {
    on: false,
    log() {},
    error() {
      assert.fail("unexpected runner error");
    },
  });
  assert(result.ok);
  assert.equal(result.val.passed, randomReps + 1);
} else {
  // Same successful-rep path, split at the helper's public API boundaries.
  for (let i = 0; i <= randomReps; i++) {
    let mark = performance.now();
    const next = reps.next();
    phases.generateMs += performance.now() - mark;
    assert(!next.done && next.value.ok);
    mark = performance.now();
    const rows = next.value.arg.val;
    phases.originalValueMs += performance.now() - mark;
    mark = performance.now();
    const picks = table.pickify(rows, "can't pickify value");
    phases.pickifyMs += performance.now() - mark;
    assert(picks.ok);
    mark = performance.now();
    const gen = Gen.build(table, picks.val);
    phases.buildMs += performance.now() - mark;
    assert(gen.ok);
    mark = performance.now();
    const rebuilt = gen.val;
    phases.rebuiltValueMs += performance.now() - mark;
    mark = performance.now();
    assert.deepStrictEqual(rebuilt, rows, "regenerated value didn't match");
    phases.equalityMs += performance.now() - mark;
    pickCount += picks.val.length;
    observe(rows);
  }
}
const elapsedMs = performance.now() - start;
const rounded = (record: Record<string, number>) =>
  Object.fromEntries(
    Object.entries(record).map((
      [key, value],
    ) => [key, Math.round(value * 10) / 10]),
  );
console.log(JSON.stringify({
  runtime: versions.deno ? `Deno ${versions.deno}` : `Bun ${versions.bun}`,
  randomReps,
  seed,
  variant,
  mode,
  setupMs: Math.round(setupMs * 10) / 10,
  elapsedMs: Math.round(elapsedMs * 10) / 10,
  ...stats,
  ...(mode === "phases" ? { pickCount, phases: rounded(phases) } : {}),
}));
