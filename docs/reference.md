# Quick Reference

A quick reference for using repeat-test. See the tutorials for more details:

- [Getting Started](./1_getting_started.md)
- [Generating Examples](./2_generating_examples.md)
- [Multiple Inputs](./3_multiple_inputs.md)

## Basic Usage

```typescript
import { arb, repeatTest } from "@skybrian/repeat-test";
import { assert } from "@std/assert";

// Basic property test
repeatTest(arb.int(0, 100), (n, console) => {
  console.log("testing:", n);  // Only prints on failure
  assert(n >= 0);
});

// Multiple inputs using arb.object
const input = arb.object({ s: arb.string(), n: arb.int(0, 10) });
repeatTest(input, ({ s, n }, console) => {
  // Test with string s and int n
});

// With explicit examples
repeatTest(["hello", "world", arb.string()], (s) => {
  // Runs with "hello", "world", then random strings
});
```

## arb.* Functions (Arbitraries)

Arbitraries generate random values for testing.

### Primitives

| Function | Description |
|----------|-------------|
| `arb.int(min, max)` | Integer in range [min, max] |
| `arb.int32()` | Signed 32-bit integer |
| `arb.safeInt()` | Any safe integer |
| `arb.boolean()` | true or false |
| `arb.biased(p)` | Boolean with probability p of being true |

### Strings

| Function | Description |
|----------|-------------|
| `arb.string(opts?)` | Any JS string (may have unpaired surrogates) |
| `arb.wellFormedString(opts?)` | Well-formed Unicode string |
| `arb.asciiChar(regexp?)` | Single ASCII character |
| `arb.asciiLetter()` | a-z or A-Z |
| `arb.asciiDigit()` | 0-9 |
| `arb.asciiSymbol()` | ASCII punctuation/symbols |
| `arb.asciiWhitespace()` | ASCII whitespace |
| `arb.char16()` | Any single 16-bit code unit |
| `arb.unicodeChar()` | Single Unicode code point (1-2 chars) |

### Collections

| Function | Description |
|----------|-------------|
| `arb.array(item, opts?)` | Array of items |
| `arb.uniqueArray(item, opts?)` | Array with unique items (item must be Domain) |
| `arb.object(shape)` | Object with given shape |
| `arb.union(...cases)` | One of several object shapes |
| `arb.table(row, opts?)` | Array of objects with optional unique keys |

**ArrayOpts**: `{ length?: number | { min?: number, max?: number } }`

### Combinators

| Function | Description |
|----------|-------------|
| `arb.of(...values)` | One of the given constant values |
| `arb.oneOf(...arbs)` | Value from one of the given Arbitraries |
| `arb.from(buildFn)` | Custom Arbitrary from build function |
| `arb.alias(init)` | Lazy/recursive Arbitrary |

## dom.* Functions (Domains)

Domains are Arbitraries that can also parse/validate values. Use when you need
round-trip validation.

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

## Custom Arbitraries

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

## Recursive Types

```typescript
import { arb, type Arbitrary } from "@skybrian/repeat-test";

type Tree = { value: number; children: Tree[] };

const tree: Arbitrary<Tree> = arb.alias(() =>
  arb.object({
    value: arb.int(0, 100),
    children: arb.array(tree, { length: { max: 3 } }),
  })
);
```

## Writing Property Tests

### Verify Variety with `sometimes()`

Use `console.sometimes(key, condition)` to ensure arbitraries generate
sufficient variety. The test fails if the condition is never true or never
false across all repetitions.

```typescript
repeatTest(arb.int(-100, 100), (n, console) => {
  console.sometimes("positive", n > 0);
  console.sometimes("negative", n < 0);
  console.sometimes("zero", n === 0);
});
```

### Verify Probabilities with `checkOdds()`

Use `console.checkOdds(key, expectedProb, condition)` to verify a condition
occurs with an expected probability:

```typescript
repeatTest(arb.int(0, 99), (n, console) => {
  // Verify divisibility by 10 occurs ~10% of the time
  console.checkOdds("divisible by 10", 0.1, n % 10 === 0);
});

// Also works with small sets using exact comparison
repeatTest(arb.boolean(), (val, console) => {
  console.checkOdds("true", 0.5, val);  // exactly 1/2 of {true, false}
});
```

For small sets where all values are enumerated, it compares the exact ratio.
For larger sampled sets, it performs a statistical test.

### Assert Invariants

Property tests should verify that generated values satisfy expected constraints:

```typescript
repeatTest(arb.array(arb.int(0, 100)), (arr, console) => {
  const sorted = [...arr].sort((a, b) => a - b);
  assert(sorted.length === arr.length);
  for (let i = 1; i < sorted.length; i++) {
    assert(sorted[i - 1] <= sorted[i]);
  }
});
```

### Combine Checks

Put all checks for the same arbitrary in a single `repeatTest` call for better
performance:

```typescript ignore
// Good: one repeatTest with multiple assertions
repeatTest(myArbitrary, (val, console) => {
  console.sometimes("case A", checkA(val));
  console.sometimes("case B", checkB(val));
  assert(invariant(val));
});

// Less efficient: separate repeatTest calls
repeatTest(myArbitrary, (val) => assert(invariant(val)));
repeatTest(myArbitrary, (val, t) => t.sometimes("case A", checkA(val)));
```

## Writing Custom Arbitraries

### Default Values

Every Arbitrary has a default value. For example, the default for `arb.string()`
is the empty string, and the default for `arb.int(0, 100)` is 0. When
`repeatTest` runs an Arbitrary, it tries the default value first as a smoke
test before generating random values.

When writing a custom Arbitrary with `arb.from()`, think about what the default
value should be. The default is determined by each nested `pick()` call
returning its own default. For `IntRequest`, the default is always the minimum
of the range. For `arb.boolean()`, the default is `false`. For `arb.oneOf()`,
the default comes from the first case.

See [defaults.md](./defaults.md) for a complete table of default values.

### Performance Tips

Here are some tips to make property tests run faster:

### Prefer Shorter Lengths

For strings and arrays, test shorter values more often. Built-in arbitraries
already do this. When writing custom arbitraries with `arb.from()`, consider
picking between adding an item or ending:

```typescript
// This shrinks better than generating a length then filling
const shortList = arb.from((pick) => {
  const items: number[] = [];
  while (pick(arb.boolean())) {  // 50% chance to continue
    items.push(pick(arb.int(0, 100)));
  }
  return items;
});
```

### Combine pick calls (advanced)

For further performance optimization, the number of pick calls can sometimes be
reduced by using a single pick to make multiple decisions. This is an advanced
technique that uses `IntRequest` directly instead of higher-level Arbitraries.

`IntRequest` is the low-level primitive that all Arbitraries are built on. It
picks a non-negative integer in a range, and its default value is always the
minimum of the range. By carefully choosing ranges, you can encode multiple
decisions in one pick:

```typescript
import { arb, IntRequest } from "@skybrian/repeat-test";

// IntRequest(0, 201) gives 202 values:
// - 0-100: stop (~50% chance; 0 is default, so empty list is default)
// - 101-201: continue with value 0-100 (~50% chance)
const stopOrValue = new IntRequest(0, 201);

const shortListOptimized = arb.from((pick) => {
  const items: number[] = [];
  while (true) {
    const choice = pick(stopOrValue);
    if (choice <= 100) {
      break;  // stop
    }
    items.push(choice - 101);  // map 101-201 to 0-100
  }
  return items;
});
```

This encodes both the "continue or stop" decision and the item value in a single
pick call, reducing overhead. The key insight is that the default (0) must
correspond to termination, otherwise the default value generation will loop
forever.

### Test Your Arbitraries

Write property tests for custom arbitraries using `console.sometimes()` to
verify they generate the expected variety:

```typescript ignore
repeatTest(myCustomArbitrary, (val, console) => {
  console.sometimes("has property X", hasPropertyX(val));
  console.sometimes("has property Y", hasPropertyY(val));
  // Verify invariants always hold
  assert(isValid(val));
});
```

Also consider verifying the default value is what you expect:

```typescript ignore
import { assertEquals } from "@std/assert";
import { arb, generateDefault } from "@skybrian/repeat-test";

const myArbitrary = arb.from((pick) => {
  // ... build logic ...
});

// Test the default value directly
assertEquals(generateDefault(myArbitrary).val, expectedDefault);
```

## Utilities

### frozen()

Deep-freeze objects for use as test examples:

```typescript
import { frozen, repeatTest } from "@skybrian/repeat-test";

repeatTest([frozen({ a: 1 }), frozen({ nested: { b: 2 } })], (obj) => {
  // obj is deeply frozen
});
```

## Controlling Repetitions with REPS

Use the `REPS` environment variable to control how many repetitions each test
runs. The value is specified as either a percentage or a multiplier relative
to the baseline rep count (default 1000, or `opts.reps` if specified).

### Quick Testing (< 100%)

For faster iteration during development, use a low percentage:

```bash
REPS=1% deno test --allow-env   # ~10 reps per test (1% of 1000)
REPS=5% deno test --allow-env   # ~50 reps per test
REPS=0.5x deno test --allow-env # ~500 reps per test
```

When the multiplier is less than 1, `sometimes()` validation is skipped since
low rep counts may not satisfy coverage requirements.

Note: The rep count is always at least 1, so `REPS=0%` runs 1 rep per test.

### Thorough Testing (> 100%)

For more thorough testing, use a higher multiplier:

```bash
REPS=5x deno test --allow-env   # 5000 reps per test
REPS=500% deno test --allow-env # 5000 reps per test (same as 5x)
```

This simply runs more repetitions, which increases the chance of finding bugs
that only occur with specific combinations of random inputs.

### Normal Testing (100% / 1x)

`REPS=100%` or `REPS=1x` is equivalent to not setting REPS at all.

Note: `REPS` is ignored when `repeatTest` is called with the `only`
option, since that mode is intended for reproducing a specific failing rep.
