# repeat-test

A property-based testing library for Deno/TypeScript, similar to fast-check or QuickCheck.

## Quick Reference

```bash
# Run all tests
deno test

# Run tests with coverage
deno task coverage
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
docs/                # Documentation
```

## Key Concepts

- **Arbitrary<T>**: Generates random values of type T for testing
- **Domain<T>**: An Arbitrary that can also parse/validate values (bidirectional)
- **Script**: A composable building block for Arbitraries
- **Gen**: A generated value with its pick sequence (for shrinking)
- **repeatTest(examples, testFn)**: Main entry point for running property tests

## Common Patterns

### Creating Arbitraries

```typescript
import { arb } from "@skybrian/repeat-test";

// Built-in arbitraries
arb.int(0, 100)           // integers in range
arb.string()              // strings
arb.boolean()             // booleans
arb.array(arb.int(0,10))  // arrays
arb.object({ x: arb.int(0,10), y: arb.string() })  // objects

// Custom arbitrary from build function
arb.from((pick) => {
  const x = pick(arb.int(0, 10));
  const y = pick(arb.string());
  return { x, y };
});
```

### Writing Tests

```typescript
import { repeatTest } from "@skybrian/repeat-test";

repeatTest(arb.int(0, 100), (n, console) => {
  console.log("testing:", n);  // Only prints on failure
  assert(n >= 0);
});
```

## Testing Guidelines

- Tests use `@std/testing/bdd` style (describe/it)
- Test files are in `test/` with `_test.ts` suffix
- Use `takeAll()` from `test/lib/ordered.ts` to enumerate all values of small Arbitraries
- Use `assertRoundTrip()` from `test/lib/asserts.ts` for Domain round-trip tests

## Implementation Notes

- Arbitraries are built on "pick functions" that request integers from ranges
- Shrinking works by replaying picks with smaller values
- The pick tree tracks explored playouts to avoid duplicates
- Domains extend Arbitraries with `pickify` (value → picks) for parsing
