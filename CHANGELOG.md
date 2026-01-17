## 0.5.1 (unreleased)

(This release was co-authored with AI.)

### QUICKREPS environment variable

* We added a way to run property tests with fewer repetitions, for a quick sanity check without running the full test suite. Example:

```bash
QUICKREPS=5 deno test --allow-env
```

This runs 5 repetitions [^1] instead of the test's default, which is usually 1000, but a test can explicity set it using the `reps` parameter. It also skips `sometimes()` assertions because they aren't expected to pass if you run a property test for fewer reps than normal.

[^1]: Actually six repetitions, because repeat-test always does a smoke test using a default value before generating data randomly.

### `frozen()` utility function

For safety, the `repeatTest` function fails if the list of examples contains any objects that aren't frozen. The `frozen` function does a deep freeze, so you can freeze an entire example list at once. Example:

```typescript
import { assert } from "@std/assert";
import { frozen, repeatTest } from "@skybrian/repeat-test";

type Pelican = { name: string; pouch: { fishCount: number } };

const pelicans: Pelican[] = frozen([
  { name: "Pete", pouch: { fishCount: 3 } },
  { name: "Penny", pouch: { fishCount: 7 } },
]);

repeatTest(pelicans, (pelican) => {
  assert(pelican.pouch.fishCount > 0, `${pelican.name}'s pouch is empty!`);
});
```

### docs/reference.md

We wrote some documentation primarily targeted at coding agents.
Ask your coding agent to look at [docs/reference.md](docs/reference.md) before writing property tests using repeat-test, and hopefully you'll get better results.

## 0.5.0

Lots of changes. Some highlights:

### API for generating test data:

* PickSet is renamed to Pickable; this is the common API for anything that can
  generate test data.

* A Script is slightly fancier; it's a build function that's been given a name
  and some options.

* Arbitrary has been simplified by moving functionality to Script, but is
  otherwise pretty much the same.

* When choosing between different alternatives (such as with arb.oneOf), each
  case can be given a different weight, which controls how often that choice
  will be randomly picked.

* arb.table() is more flexible: it takes an arb.object() or an arb.union(). This
  allows a table to have a rows of different shapes. How unique keys are
  generated can be different in each case too. (They need to be parsable by a
  common Domain, though.)

* PickRequest is renamed to IntRequest, which better explains what it does.

* Generated<T> is renamed to Gen<T> and has an extended API for 

### API for parsing data (Domains):

* dom.oneOf() is renamed to dom.firstOf() which better describes what it does.

* dom.taggedUnion() can be used to pick a case based on type tags.

* dom.table() takes a dom.object() or a dom.taggedUnion(), allowing tables
to have rows of different shapes.

### Examples:

* examples/deno_doc contains an extended example that parses the output of
  `deno doc --json` and prints an API summary. This is the largest schema I've
  written so far using Domains. It's still incomplete, though.

### Internals:

* How shrinking works has changed quite a bit. Before, it was a flat array of
  picks. That representation is still used by Domains, but internally, picks are
  also sometimes grouped by pick() call. This makes mutations a bit easier.
  Groups of picks don't nest; that's left for some other time.

## 0.4.0

* API: add console.debugger() and console.sometimes().
* API: removed Arbitrary.default() method. (Now internal.)
* Changed the random distributions for array and string arbitraries so they sometimes generate the maximum allowed length.
* Arbitrary.filter() rejects filters that are too strict.
* Improved performance of arb.uniqueArray() and arb.table().
* Wrote [docs](./docs) about getting started and using Arbitraries.

## 0.3.0

* API: all array-like arbitraries and domains now take a length option
* API: removed label option on tables
* API: PickRequest's bias option takes a source of random int32's as input.
* API: PickRequest.bias => PickRequest.random
* Improved performance on generating strings and changed the character distribution

## 0.2.0

* Added separate entrypoints for parts of repeat-test
* Arbitrary.with() is now the only way to set a custom label
* arb.table() no longer requires a Domain for non-keys; rename uniqueKeys => keys
* Removed Domain.arb

## 0.1.2

* Changed Domain class to extend Arbitrary instead of containing an Arbitrary.
* Try to get README.md to show up on jsr.io.

## 0.1.1

* Oops, README and examples weren't published.

## 0.1.0

* First release pushed to jsr.io.
