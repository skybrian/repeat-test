# repeat-test

A property-based testing library for Deno/TypeScript, similar to fast-check or QuickCheck.

## Quick Reference

```bash
deno test              # Run all tests
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
docs/                # Documentation
```

## Key Concepts

- **Arbitrary<T>**: Generates random values of type T for testing
- **Domain<T>**: An Arbitrary that can also parse/validate values (bidirectional)
- **Script**: A composable building block for Arbitraries
- **Gen**: A generated value with its pick sequence (for shrinking)
- **repeatTest(examples, testFn)**: Main entry point for running property tests

## API Reference

### Writing Tests

```typescript
import { repeatTest } from "@skybrian/repeat-test";

// Basic property test
repeatTest(arb.int(0, 100), (n, console) => {
  console.log("testing:", n);  // Only prints on failure
  assert(n >= 0);
});

// Multiple inputs
repeatTest([arb.string(), arb.int(0, 10)], (s, n, console) => {
  // ...
});
```

### arb.* Functions (Arbitraries)

| Function | Description |
|----------|-------------|
| `arb.int(min, max)` | Integer in range [min, max] |
| `arb.int32()` | Signed 32-bit integer |
| `arb.safeInt()` | Any safe integer |
| `arb.boolean()` | true or false |
| `arb.biased(p)` | Boolean with probability p of being true |
| `arb.string(opts?)` | Any JS string (may have unpaired surrogates) |
| `arb.wellFormedString(opts?)` | Well-formed Unicode string |
| `arb.asciiChar(regexp?)` | Single ASCII character |
| `arb.asciiLetter()` | a-z or A-Z |
| `arb.asciiDigit()` | 0-9 |
| `arb.asciiSymbol()` | ASCII punctuation/symbols |
| `arb.asciiWhitespace()` | ASCII whitespace |
| `arb.char16()` | Any single 16-bit code unit |
| `arb.unicodeChar()` | Single Unicode code point (1-2 chars) |
| `arb.array(item, opts?)` | Array of items |
| `arb.uniqueArray(item, opts?)` | Array with unique items (item must be Domain) |
| `arb.object(shape)` | Object with given shape |
| `arb.union(...cases)` | One of several object shapes |
| `arb.table(row, opts?)` | Array of objects with optional unique keys |
| `arb.of(...values)` | One of the given constant values |
| `arb.oneOf(...arbs)` | Value from one of the given Arbitraries |
| `arb.from(buildFn)` | Custom Arbitrary from build function |
| `arb.alias(init)` | Lazy/recursive Arbitrary |

**ArrayOpts**: `{ length?: number | { min?: number, max?: number } }`

### dom.* Functions (Domains)

Domains are like Arbitraries but can also parse values. Use when you need round-trip validation.

| Function | Description |
|----------|-------------|
| `dom.int(min, max)` | Integer in range |
| `dom.int32()` | Signed 32-bit integer |
| `dom.boolean()` | Boolean |
| `dom.string(opts?)` | Any JS string |
| `dom.wellFormedString(opts?)` | Well-formed Unicode string |
| `dom.asciiChar(regexp?)` | Single ASCII character |
| `dom.asciiLetter()` | a-z or A-Z |
| `dom.char16()` | Single 16-bit code unit |
| `dom.array(item, opts?)` | Array of items |
| `dom.uniqueArray(item, opts?)` | Array with unique items |
| `dom.object(shape, opts?)` | Object with shape |
| `dom.taggedUnion(tagProp, cases)` | Discriminated union |
| `dom.table(row, opts?)` | Array of objects |
| `dom.of(...values)` | One of given values |
| `dom.firstOf(...doms)` | First matching domain |
| `dom.alias(init)` | Lazy/recursive Domain |

### Custom Arbitraries

```typescript
// Using arb.from with a build function
const point = arb.from((pick) => {
  const x = pick(arb.int(0, 100));
  const y = pick(arb.int(0, 100));
  return { x, y };
});

// Using arb.object (simpler for plain objects)
const point2 = arb.object({
  x: arb.int(0, 100),
  y: arb.int(0, 100),
});

// Filtering
const evenInt = arb.int(0, 100).filter(n => n % 2 === 0);

// Mapping
const doubled = arb.int(0, 50).map(n => n * 2);

// Chaining (dependent generation)
const pair = arb.int(1, 10).chain(n => 
  arb.array(arb.int(0, 100), { length: n })
);
```

### Recursive Types

```typescript
type Tree = { value: number; children: Tree[] };

const tree: Arbitrary<Tree> = arb.alias(() =>
  arb.object({
    value: arb.int(0, 100),
    children: arb.array(tree, { length: { max: 3 } }),
  })
);
```

## Testing Guidelines

### Project Conventions

- Tests use `@std/testing/bdd` style (describe/it)
- Test files are in `test/` with `_test.ts` suffix
- Use `takeAll()` from `test/lib/ordered.ts` to enumerate all values of small Arbitraries
- Use `assertRoundTrip()` from `test/lib/asserts.ts` for Domain round-trip tests

### Writing Property Tests

- **Verify variety**: Use `console.sometimes(key, condition)` assertions to ensure
  arbitraries generate sufficient variety of examples. The test fails if the
  condition is never true or never false across all repetitions.

- **Assert invariants**: Property tests should verify that generated values
  satisfy expected constraints (e.g., `assert(n >= 0 && n <= 100)`).

- **Combine checks**: Put all checks for the same arbitrary in a single
  `repeatTest` call for better performance.

### Writing Custom Arbitraries

- **Prefer shorter lengths**: For strings and arrays, test shorter values more
  often. Built-in arbitraries already do this, so generating an array and
  mapping it works well. Alternatively, use `arb.from()` to pick between adding
  an item or ending (shrinks better).

- **Test your arbitraries**: Write property tests for custom arbitraries using
  `console.sometimes()` to verify they generate the expected variety of values.

### Quick Testing

Use `QUICKREPS` environment variable for faster iteration:

```bash
QUICKREPS=5 deno test --allow-env  # Quick smoke test
deno task test:quick               # Same, via task
deno task status                   # Only runs if files changed
```

Note: `QUICKREPS` skips `sometimes()` validation since low rep counts may not
satisfy coverage requirements.

## Implementation Notes

- Arbitraries are built on "pick functions" that request integers from ranges
- Shrinking works by replaying picks with smaller values
- The pick tree tracks explored playouts to avoid duplicates
- Domains extend Arbitraries with `pickify` (value → picks) for parsing

## Further Reading

- `docs/1_getting_started.md` - Tutorial introduction
- `docs/2_generating_examples.md` - More on Arbitraries
- `docs/3_multiple_inputs.md` - Multiple test inputs
- `examples/` - Runnable examples
- Run `deno doc src/entrypoints/arbs.ts` for full API docs

## Benchmarks

Run benchmarks with: `deno bench performance/benchmarks.ts`

Record results in `performance/exe_dev_benchmarks.md` (see that file for instructions).
