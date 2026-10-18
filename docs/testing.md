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
