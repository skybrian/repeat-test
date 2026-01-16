# repeat-test

A property-based testing library for Deno/TypeScript, similar to fast-check or QuickCheck.

## Quick Reference

```bash
deno task status       # Check + lint + quick test (only if files changed)
deno task test         # Run all tests
deno task test:quick   # Quick smoke test (QUICKREPS=5)
deno task coverage     # Run tests with coverage
```

## Project Structure

```
src/
  entrypoints/       # Public API entry points
    mod.ts           # Main entry: repeatTest, arb, dom namespaces
    core.ts          # Core types: Arbitrary, Domain, Script, Gen, etc.
    arbs.ts          # Arbitrary builders (arb.int, arb.string, etc.)
    doms.ts          # Domain builders (dom.int, dom.string, etc.)
    runner.ts        # Test runner exports
  arbitraries/       # Arbitrary implementations
  domains/           # Domain implementations (Arbitraries with parsers)
  scripts/           # Script implementations
  *.ts               # Core implementation files
test/                # Tests mirror src/ structure
examples/            # Usage examples
docs/                # Documentation (see docs/reference.md for API)
scripts/             # Build/dev scripts
```

## Key Concepts

- **Arbitrary<T>**: Generates random values of type T for testing
- **Domain<T>**: An Arbitrary that can also parse/validate values (bidirectional)
- **Script**: A composable building block for Arbitraries
- **Gen**: A generated value with its pick sequence (for shrinking)
- **repeatTest(examples, testFn)**: Main entry point for running property tests

## Test Conventions

- Tests use `@std/testing/bdd` style (describe/it)
- Test files are in `test/` with `_test.ts` suffix
- Use `takeAll()` from `test/lib/ordered.ts` to enumerate all values of small Arbitraries
- Use `assertRoundTrip()` from `test/lib/asserts.ts` for Domain round-trip tests
- Use `frozen()` instead of `Object.freeze()` for test examples

## Implementation Notes

- Arbitraries are built on "pick functions" that request integers from ranges
- Shrinking works by replaying picks with smaller values
- The pick tree tracks explored playouts to avoid duplicates
- Domains extend Arbitraries with `pickify` (value → picks) for parsing

## Documentation

- `docs/reference.md` - API quick reference
- `docs/1_getting_started.md` - Tutorial introduction
- `docs/2_generating_examples.md` - More on Arbitraries
- `docs/3_multiple_inputs.md` - Multiple test inputs
- `examples/` - Runnable examples
- Run `deno doc src/entrypoints/arbs.ts` for full API docs

## Benchmarks

Run benchmarks with: `deno bench performance/benchmarks.ts`

Record results in `performance/exe_dev_benchmarks.md` (see that file for instructions).
