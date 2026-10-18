# Benchmark Results (exe.dev VM)

Machine: Intel Xeon Platinum 8259CL @ 2.50GHz (x86_64-unknown-linux-gnu)

## How to Update

1. Ensure working directory is clean (`git status` shows no changes)
2. Run benchmarks: `deno bench performance/benchmarks.ts`
3. Record results below with:
   - Version number (from deno.jsonc)
   - Deno version
   - Git commit hash (first 7 chars): `git rev-parse --short HEAD`
   - Date
   - Brief description of what changed (if relevant)
4. Commit the updated file

---

## Version 0.5.1 — table round-trip investigation

Commit: 68d5e91 | Deno 2.9.7 | Bun 1.4.3 | 2026-10-18

No library or test changes. The following measurements investigate
`table > with two row shapes > round-trips generated tables` in
`test/api/domains/tables_test.ts`.

### Reproduction and method

```sh
deno run performance/table_roundtrip.ts 5000 123 original full
bun run performance/table_roundtrip.ts 5000 123 original full
```

On this VM, Bun is installed at `~/.bun/bin/bun`. Arguments are random
repetition count, seed, variant, and mode. The count is explicit and is not
scaled by `REPS`; there is also one default repetition. Variants are `original`,
`short-strings` (max 16 code units), `no-strings` (constant empty string), and
`short-tables` (max 3 rows). Modes are `full`, `generate` (skip the round-trip
assertion), and `phases`.

The harness uses the actual runner and API round-trip assertion. Internal runner
entry points supply a fixed seed, instead of the randomly chosen seed used by
`repeatTest`. The generator keeps the runner's 10,000-pick limit. Both runtimes
produced matching workload statistics for every paired run.

Each measurement uses a fresh process, without explicit warmup, coverage, or
profiling. Module loading is outside the timer; schema construction is reported
separately (roughly 10–27 ms). Timings include generation, assertions, runner
overhead, and small counters for workload statistics. Runtime pairs ran
sequentially, alternating their order across seeds, with no other benchmark
process running. These are local observations, not general engine rankings.

### Original workload

Seconds elapsed, one cold process per runtime/seed/count:

| Seed   | Deno, 1,000 random reps | Bun, 1,000 | Deno, 5,000 | Bun, 5,000 |
| ------ | ----------------------: | ---------: | ----------: | ---------: |
| 123    |                   2.211 |      2.204 |       7.934 |      8.709 |
| 456    |                   1.870 |      2.049 |       8.188 |      8.657 |
| 789    |                   1.915 |      1.934 |       8.034 |      8.887 |
| Median |                   1.915 |      2.049 |       8.034 |      8.709 |

Bun's median was about 8% slower at 5,000 random reps. Both runtimes take
seconds; this is not a Bun-only timeout problem.

For seed 123 at 5,000 random reps, the workload is 5,001 tables, 47,508 rows,
23,594 strings, and 3,572,704 UTF-16 code units. Maximum observed table/string
sizes are 10 rows and 1,000 units. The unique IDs 1..10 cap table size at 10
despite the default maximum array length of 1,000. Length biases favor
continuation, so the test usually generates close to 10 rows, not tiny tables.

The pickified tables contain 7,340,205 integer replies. Rebuilding consumes
those replies, on top of the original generation and unique-key canonicalization
work.

### Where time goes

One instrumented run per runtime, seed 123, 5,000 random reps. Phase
instrumentation changes the call sites and adds timers, so use the table above
for overall runtime comparisons.

| Phase                           | Deno seconds | Bun seconds |
| ------------------------------- | -----------: | ----------: |
| Generate original tables        |         4.08 |        4.75 |
| Pickify tables                  |         0.63 |        0.96 |
| Rebuild with `Gen.build`        |         3.17 |        2.71 |
| Deep equality                   |         0.17 |        0.09 |
| Total, including small overhead |         8.09 |        8.54 |

Generation-only runs took 3.97 s (Deno) and 4.71 s (Bun). Deep equality is not
the main cost. The helper performs one pickification and one rebuild, not a
redundant additional `Domain.parse`.

CPU profiles of separate full runs reinforce the phase measurements:

- Strings require per-code-unit pick dispatch, tree traversal, and in-memory
  logging for replay/shrinking. This logging is not console output.
- Unique-key handling adds ordered witness generation, canonicalization, and
  pruning in `Jar`/`UnionJar`, repeated when rebuilding the table.
- Deno attributed about 20.7% of weighted self samples to `Filtered`
  construction (an `Error` subclass), versus 2.8% in Bun. These sampled stacks
  all came through `Jar.#nextExample`, not evidence of repeated random
  duplicate-row rejection.
- Bun attributed more self time to pick-tree operations and pick logging/list
  construction. Inlining and engine profiling attribution differ, so these
  percentages do not directly compare individual function speeds.

Profiles include startup. Percentages weight samples by their time deltas;
recursive inclusive stacks must be deduplicated, not summed. Deno reported about
3.7% explicit GC time; Bun's lack of GC-labelled frames does not establish that
it did no GC.

To collect profiles:

```sh
deno run --cpu-prof --cpu-prof-dir=/tmp --cpu-prof-name=table-deno.cpuprofile \
  performance/table_roundtrip.ts 5000 123 original full
bun --cpu-prof --cpu-prof-dir=/tmp --cpu-prof-name=table-bun \
  performance/table_roundtrip.ts 5000 123 original full
```

### Workload experiments and possible improvements

Single paired runs, seed 123, 5,000 random reps; changing constraints also
changes the generated corpus, so these are workload experiments, not
isolated-operation microbenchmarks:

| Variant                    | Deno seconds | Bun seconds |   Rows | String code units |
| -------------------------- | -----------: | ----------: | -----: | ----------------: |
| Original                   |         7.93 |        8.71 | 47,508 |         3,572,704 |
| Strings capped at 16 units |         4.96 |        3.68 | 47,786 |           117,833 |
| Constant empty strings     |         4.21 |        3.34 | 48,003 |                 0 |
| Tables capped at 3 rows    |         1.58 |        1.90 | 11,475 |           880,840 |

The empty-string case shows substantial table/key overhead even without large
strings. Bun is not slower on every variant.

For a faster API regression test, consider smaller randomized tables/strings and
explicit boundary examples for full-length strings and all 10 unique IDs.
Reducing workloads should preserve those behaviors deliberately, rather than
just raising the timeout or silently dropping boundary coverage.

A separate library optimization candidate is ordered-search cancellation:
`OrderedTracker.maybePick` finds the lowest globally unpruned pick, but
`pruneBranchTo` cannot initialize a fresh pass-tree node. The subsequent pick
can therefore revisit a pruned branch, cancel, and construct `Filtered` before
retrying. This fits the sampled `Jar.#nextExample → generate → dispatch` stacks.
Avoiding redundant probes could retain the original workload and coverage. A
change needs tests for ordering, pass-width limits, nested requests, and
exhaustion; simply replacing the requested minimum can exceed the narrowed pass
range. No such optimization is implemented here.

### General benchmark baseline

Also ran `deno bench performance/benchmarks.ts` on the clean baseline commit
before adding this harness:

| Benchmark                           | Average time/iteration |
| ----------------------------------- | ---------------------: |
| generate a string                   |                19.8 µs |
| take 10k char16                     |                11.0 ms |
| uniqueArray of 5 ints               |               188.9 µs |
| uniqueArray of 6 ints               |               187.3 µs |
| uniqueArray of 100 ints             |                 2.0 ms |
| generate 10k strings                |               358.3 ms |
| fail to shrink a 1k string          |                79.4 ms |
| fail to shrink var length 1k string |               124.5 ms |
| shrink an array of strings          |                27.5 ms |

---

## Version 0.5.0

Commit: 13ab692 | Deno 2.6.5 | 2025-01-15 | Initial baseline

```
| benchmark                             | time/iter (avg) |        iter/s |      (min … max)      |      p75 |      p99 |     p995 |
| ------------------------------------- | --------------- | ------------- | --------------------- | -------- | -------- | -------- |
| generate a string                     |         25.6 µs |        39,010 |  (17.9 µs …   8.5 ms) |  21.1 µs | 121.3 µs | 189.1 µs |
| take 10k char16                       |         13.1 ms |          76.1 |  (10.7 ms …  34.0 ms) |  11.9 ms |  34.0 ms |  34.0 ms |
| uniqueArray of 5 ints                 |        242.9 µs |         4,117 | (187.1 µs …   5.6 ms) | 250.5 µs | 561.5 µs | 619.9 µs |
| uniqueArray of 6 ints                 |        245.9 µs |         4,067 | (205.0 µs … 780.7 µs) | 234.8 µs | 451.7 µs | 479.9 µs |
| uniqueArray of 100 ints               |          2.2 ms |         447.2 |   (2.0 ms …   5.0 ms) |   2.3 ms |   4.5 ms |   4.9 ms |
| generate 10k strings                  |        371.5 ms |           2.7 | (362.8 ms … 410.7 ms) | 368.3 ms | 410.7 ms | 410.7 ms |
| fail to shrink a 1k string            |         94.1 ms |          10.6 |  (74.6 ms … 231.9 ms) |  84.4 ms | 231.9 ms | 231.9 ms |
| fail to shrink var length 1k string   |        131.7 ms |           7.6 | (127.3 ms … 143.1 ms) | 134.4 ms | 143.1 ms | 143.1 ms |
| shrink an array of strings            |         30.1 ms |          33.3 |  (27.1 ms …  47.3 ms) |  29.5 ms |  47.3 ms |  47.3 ms |
```
