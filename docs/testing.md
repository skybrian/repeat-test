# Test coverage

`deno task coverage` keeps its existing behavior: run all tests and write
`lcov.info` plus a terminal report.

To collect API-only and full-suite coverage separately:

```sh
deno task coverage:compare
```

This runs `test/api/` and then the full Deno test suite, using the same coverage
filters for both. Only files under `src/` are included, with
`coverage_exclusions.ts` excluded, as in the existing task. It does not run Bun
tests.

Reports are saved separately:

| Suite     | LCOV                     | HTML entry point               |
| --------- | ------------------------ | ------------------------------ |
| API only  | `coverage/api/lcov.info` | `coverage/api/html/index.html` |
| All tests | `coverage/all/lcov.info` | `coverage/all/html/index.html` |

Each collection cleans only its own suite's profile directory. A successful
collection also records the input content hashes, Deno version, and repetition
setting in `coverage/comparison.json`. These generated files are ignored by Git.
An interrupted or failed collection does not leave a valid comparison manifest.

Both suites use the same inherited `REPS` setting (default: normal repetitions).
For example, `REPS=1% deno task coverage:compare` is faster, but may miss
randomly exercised paths. Use normal repetitions when deciding which API tests
to add. Running the original `coverage` task cleans the shared `coverage/`
directory, so collect the comparison again afterward.

## Comparing the suites

The command prints a per-file table sorted by the largest full-suite minus API
coverage gap, in percentage points. It also counts **internal-only lines**:
lines hit by the full suite but not the API suite. These are useful starting
points for new API tests, not necessarily behaviors that belong in API tests.

Both percentages use the same denominator: the union of executable line numbers
in the two LCOV reports. A file absent from the API report counts as zero API
coverage, not as an omitted file. Totals are weighted by executable lines rather
than averaging file percentages. Files absent from _both_ reports cannot be
measured by this comparison.

Each suite samples independently. An API run can occasionally hit a line that
the full-suite run misses, so a negative gap is possible. "Internal-only" means
observed only in the full run; it is not proof that API tests cannot reach it.
The table measures line coverage, not branch coverage. HTML reports retain the
additional coverage details provided by Deno.

## Inspecting a file

After collecting reports, inspect any measured source file without rerunning
tests:

```sh
deno task coverage:file src/arbitraries/arrays.ts
deno task coverage:file src/arbitraries/arrays.ts --all
```

The default view shows gaps in API coverage with two surrounding lines of
context, merging overlapping groups. `--all` shows the entire file. Source lines
have line numbers and these markers:

- `A`: hit by API tests.
- `I`: hit by the full suite, but not the API run.
- `U`: measured, but hit by neither run.
- `-`: no executable line record in either report (for example, a comment).

Start with `I` lines when looking for additional API tests; `U` lines may reveal
gaps in both suites. A line hit by the API run is marked `A` even if the
independent full run missed it. Line coverage alone does not imply all branches
are tested.

The command reads saved reports only and requires no subprocess or write
permissions. It rejects missing, modified, or stale reports with a refresh
command, rather than displaying potentially incorrect line annotations.
Staleness checks cover Deno's version and the contents of TypeScript/JavaScript
files under `src/`, `test/`, `examples/`, and `scripts/`, plus the Deno config
and lockfile, package config, and TypeScript config. They do not detect changes
to external dependencies or non-code fixtures; refresh manually after such
changes. The saved collection time and `REPS` setting are printed when
inspecting a file.
