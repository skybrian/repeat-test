# Public API tests

This suite runs against the current checkout in both Deno and Bun. Tests and
support files must import repeat-test only through its published entry points:
`@skybrian/repeat-test`, `/core`, `/arbs`, `/doms`, and `/runner`. Do not import
private source files, helpers from elsewhere in `test/`, or Deno-specific APIs.
Use `node:test` and Node assertions, without runtime-specific test adapters.

`deno lint` enforces this import boundary for every source file in this
directory, including support files. Relative imports must stay within
`test/api/`. The approved Node modules are `node:test`, `node:assert`, and
`node:assert/strict`; extend the allowlist in `scripts/api_test_lint.ts`
deliberately as needed. The rule also checks re-exports, type imports, and
literal dynamic imports, and rejects computed dynamic imports and `require`. It
is an architectural guardrail, not a security sandbox or a complete portability
check.

```sh
deno task test:api
bun install --frozen-lockfile
bun run test:api
```

`deno task test` runs both the public API tests and the Deno-only internal
tests. `deno task test:api:bun` is another way to run just the API tests with
Bun.

Deno resolves the package's own name using `deno.jsonc` and continues to use its
global dependency cache (`nodeModulesDir: "none"`), without requiring Bun's
install step. For Bun, the private root `package.json` mirrors the public
exports and installs the library's runtime dependencies; `tsconfig.json` maps
the source's `@/` imports. Keep these settings in sync with `deno.jsonc`. These
tests exercise local TypeScript source, not an installed JSR release or JSR's
generated npm package. Publishing remains managed by `deno.jsonc`.

Keep implementation-specific tests elsewhere in `test/`. When a file mixes API
and internal tests, extract individual cases rather than moving the entire file.

## Shared support

Helpers in `support/` obey the same import boundary as the tests:

- `asserts.ts` checks Domain round trips using public `pickify` and `Gen.build`
  APIs. Its `assertThrows` checks both the error constructor and a message
  substring; Node's built-in `throws` uses its third argument as a diagnostic
  message, not a substring matcher.
- `ranges.ts` defines integer-range generators using the public Arbitrary API.
- `console.ts` records runner diagnostics without writing expected failures to
  the real console.

Prefer tiny finite inputs and explicit repetition budgets for API tests. Runner
shrinking tests pin a replay key in a small range, so they exercise real
shrinking without sampling loops and remain effective when `REPS` is reduced.

Private enumeration, pick-encoding, seeded sampling, and implementation-oracle
helpers remain in `test/lib/` and are used only by internal tests.
