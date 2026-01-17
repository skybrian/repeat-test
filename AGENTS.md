# repeat-test

A property-based testing library for Deno/TypeScript, similar to fast-check or QuickCheck.

> **Using repeat-test in another project?** See [docs/reference.md](./docs/reference.md) for API documentation and usage guidelines.

## Task Quick Reference

```bash
deno task status        # Check + lint + quick test (only if files changed)
deno task test          # Run all tests
deno task test:quick    # Quick smoke test (REPS=1%)
deno task release-check # Checks everything more thoroughly in preparation for a release
deno task coverage      # Run tests with coverage
```

## Project Structure

```
src/
  entrypoints/       # Public API entry points
    mod.ts           # All-in-one entry point with arb and dom namespaces
    core.ts          # Just the core types: Arbitrary, Domain, Script, Gen, etc.
    arbs.ts          # Just the Arbitrary builders (arb.int, arb.string, etc.)
    doms.ts          # Just the Domain builders (dom.int, dom.string, etc.)
    runner.ts        # Just the test runner and closely-related types.
  arbitraries/       # Arbitrary builder implementations
  domains/           # Domain builder implementations (Arbitraries with parsers)
  scripts/           # Script builder implementations (Pickables with a name and flags)
  *.ts               # Core implementation files
test/                # Tests mirror src/ structure
examples/            # Usage examples
docs/                # Documentation (see docs/reference.md for API)
scripts/             # Build/dev scripts
```

## The most-used concepts

- **repeatTest(examples, testFn)**: Main entry point for running property tests
- **Arbitrary<T>**: Generates values of type T for testing, usually randomly
- **arb.from(callbackFn)**: Defines a new Arbitrary based on a callback

## Concepts that are mostly used internally

- **Pickable<T>** Most-general supertype of Arbitrary; something that picks values
- **Script<T>**: A named function that generates values (extends Pickable)
- **Domain<T>**: An Arbitrary that can also parse/validate values (bidirectional)
- **Gen**: A generated value with its pick sequence (for shrinking)

## Test Conventions

- Tests use `@std/testing/bdd` style (describe/it)
- Test files are in `test/` with `_test.ts` suffix
- Use `takeAll()` from `src/ordered.ts` to enumerate all values of small Arbitraries
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
