# Public API tests

This suite runs against the current checkout in both Deno and Bun. Tests and
support files must import repeat-test only through its published entry points:
`@skybrian/repeat-test`, `/core`, `/arbs`, `/doms`, and `/runner`. Do not import
private source files, helpers from elsewhere in `test/`, or Deno-specific APIs.
Use `node:test` and Node assertions, without runtime-specific test adapters.

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
