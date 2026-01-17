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

## Utilities

### frozen()

Deep-freeze objects for use as test examples:

```typescript
import { frozen, repeatTest } from "@skybrian/repeat-test";

repeatTest([frozen({ a: 1 }), frozen({ nested: { b: 2 } })], (obj) => {
  // obj is deeply frozen
});
```

## Quick Testing

Use the `QUICKREPS` environment variable for faster iteration during
development:

```bash
QUICKREPS=5 deno test --allow-env  # Run only 5 reps per test
```

Note: `QUICKREPS` skips `sometimes()` validation since low rep counts may not
satisfy coverage requirements.

## Deep Probabilistic Testing

### MULTIREPS

Use the `MULTIREPS` environment variable to run property tests for many more
repetitions than usual and to get a probabilistic report for `console.sometimes()`
coverage.

- `MULTIREPS` must be a positive integer.
- It is **mutually exclusive** with `QUICKREPS`. If both are set, `repeatTest`
  throws an error.
- For each `repeatTest` call, the **baseline** rep count is:
  - `opts.reps` if provided, otherwise
  - `1000` (the default).
- With `MULTIREPS=N`, `repeatTest` runs approximately `N × baseline` random
  reps (plus the usual examples/defaults).

Example:

```bash
MULTIREPS=20 deno test --allow-env  # ~20x the usual number of reps
```

During a `MULTIREPS` run:

- `console.sometimes(key, cond)` is still required to be **sometimes true and
  sometimes false** (same invariant as normal runs).
- Additionally, `repeatTest` logs a summary of how often each key was true
  and false, and estimates `p(true)` for each key.
- If a key is observed often enough (at least the baseline number of reps) but
  has an estimated `p(true)` that is "too small" relative to the baseline,
  `repeatTest` fails with an `AssertionError` that lists the offending keys.

This mode is useful for:

- Detecting flaky `sometimes()` checks whose conditions only rarely hold.
- Validating that your arbitraries actually generate the variety you expect
  when run for many more repetitions than usual.

Note: `MULTIREPS` is ignored when `repeatTest` is called with the `only`
option, since that mode is intended for reproducing a specific failing rep.
