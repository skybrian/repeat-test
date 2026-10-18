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

## Version 0.5.1 — API table test repetition budget

Commit: 97ab5a9 | Deno 2.9.7 | Bun 1.4.3 | 2026-10-18

The two-row-shape API round-trip test now requests 200 random repetitions, or
1,000 under `REPS=5x`. Its schema is unchanged. A separate deterministic example
round-trips all ten unique IDs, both shapes, and a 1,000-unit string; this
example does not scale with `REPS`.

Actual test timings, without coverage or profiling:

- Default Bun API suite: randomized case 352 ms; fixed example 1 ms.
- Three fresh Bun processes selecting these two cases under `REPS=5x`:
  randomized case 1.679 / 1.672 / 1.616 s; fixed example 1–2 ms. Each complete
  process took less than 1.8 s.
- Deno's table test file passes under `REPS=5x`, reporting approximately 1 s for
  this randomized case and 1 ms for the fixed example.

These observations leave headroom under three seconds on this VM, not a hard
timing guarantee. Default API suites pass in both runtimes, as do type checking,
lint, formatting, and the quick suite.

---

## Version 0.5.1 — ordered-search prefix pruning

Before: 383962c | After: a9e9441 | Deno 2.9.7 | Bun 1.4.3 | 2026-10-18

Initialize the current pass's tree node before pruning its known-exhausted lower
choices. If no choice remains within the pass's restricted range, normalize the
pass walk without pruning the shared search prefix or advancing twice. The
`PartialTracker` random-pick hot path is unchanged.

No API test constraints, repetition counts, or timeout settings were changed.

### Original table workload, before and after

Used the same harness and commands described in the investigation below, on
clean checkouts of both commits. Each cell is a fresh, unprofiled process; no
coverage or explicit warmup. Ran sequentially, alternating runtime order by seed
and before/after version order across seeds. Module loading and schema
construction remain outside the measured workload.

Seconds elapsed:

| Random reps | Seed | Deno before | Deno after | Bun before | Bun after |
| ----------: | ---: | ----------: | ---------: | ---------: | --------: |
|       1,000 |  123 |       1.735 |      1.246 |      1.983 |     1.735 |
|       1,000 |  456 |       1.760 |      1.252 |      1.998 |     1.774 |
|       1,000 |  789 |       1.751 |      1.231 |      1.982 |     1.594 |
|       5,000 |  123 |       8.375 |      5.386 |      8.838 |     7.249 |
|       5,000 |  456 |       8.175 |      5.804 |      8.677 |     7.654 |
|       5,000 |  789 |       8.278 |      5.412 |      8.540 |     7.280 |

| Random reps | Runtime | Median before | Median after | Less elapsed time |
| ----------: | ------- | ------------: | -----------: | ----------------: |
|       1,000 | Deno    |       1.751 s |      1.246 s |             28.8% |
|       1,000 | Bun     |       1.983 s |      1.735 s |             12.5% |
|       5,000 | Deno    |       8.278 s |      5.412 s |             34.6% |
|       5,000 | Bun     |       8.677 s |      7.280 s |             16.1% |

All before/after and cross-runtime pairs had identical table, row, string, and
code-unit counts and observed maximum lengths. Seed 123 still processes 5,001
tables, 47,508 rows, and 3,572,704 string code units at 5,000 random reps. The
phase run still pickifies 7,340,205 integer replies.

Separate follow-up CPU profiles for seed 123 had no `Filtered`/`Error`
constructor self samples in either runtime, versus approximately 20.7% in Deno
and 2.8% in Bun in the original investigation. Sampling cannot establish that no
exceptions were allocated, but this is consistent with eliminating the redundant
ordered probes. The unprofiled table above, not profile timings, measures the
improvement.

The 5,000-rep workload still exceeds Bun's default five-second test timeout.
This optimization does not remove the need for a longer timeout for that stress
run.

### Correctness checks

- Regression test enumerates 1..10 on passes 0..9 without cancelled probes.
- Tests retain pass-by-pass order, pending nested choices, pass limits, and
  nonzero-depth backtracking after narrow-pass exhaustion.
- Variable-depth branches exercise already-pruned holes between live choices.
- Walker tests cover fresh and existing nodes, original range validation,
  complete exhaustion, siblings, and ancestor bubbling.
- An additional differential experiment on 500 seeded finite trees matched the
  baseline's values, order, pass numbers, and cutoffs at 1/2/3/5 passes.
- Full Deno suite: 135 groups / 960 steps; Bun API suite: 278 tests. All pass,
  as do type checking, lint, formatting, and the quick suite.

### General benchmarks

Also ran `deno bench performance/benchmarks.ts` on each clean checkout. Average
time per iteration, one benchmark invocation per version:

| Benchmark                           |   Before |    After |
| ----------------------------------- | -------: | -------: |
| generate a string                   |  19.7 µs |  19.1 µs |
| take 10k char16                     |  10.9 ms |   9.8 ms |
| uniqueArray of 5 ints               | 214.6 µs | 196.5 µs |
| uniqueArray of 6 ints               | 198.9 µs | 189.2 µs |
| uniqueArray of 100 ints             |   2.1 ms |   2.2 ms |
| generate 10k strings                | 348.7 ms | 352.7 ms |
| fail to shrink a 1k string          |  80.3 ms |  85.8 ms |
| fail to shrink var length 1k string | 125.9 ms | 127.1 ms |
| shrink an array of strings          |  25.6 ms |  27.2 ms |

The small mixed differences in this general suite are single-run observations,
not established improvements or regressions. The focused table experiment uses
three paired seeds and provides the stronger evidence for this change.

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
