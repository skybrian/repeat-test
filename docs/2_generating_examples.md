# Part 2: Generating Examples

## Introducing Arbitraries

In [Part 1]("../1_getting_started.md") we saw a test that uses two examples, defined like this:

```
const examples = ["hello", "world"];
```

The `repeatTest` function accepts arrays for convenience, but usually we will
define a set of examples like this instead:

```ts
import { arb } from "@skybrian/repeat-test";

const examples = arb.of("hello", "world"); // Not an array anymore.
```

The type of *examples* is now `Arbitrary<string>`, but it contains the same
data. The `repeatTest` function runs a test using the same examples.

An *Arbitrary* represents a set of possible examples. Arbitraries can represent
small or large sets, sometimes *very* large; for example, `arb.string()`
represents the set of all possible strings. [^1] Arbitraries *usually* generate
fresh examples on demand, but `arb.of` is different; it picks from the examples
it's given and returns them as-is.

## Random testing

We can pass a very large Arbitrary to `repeatTest` and it works fine:

```ts
import { assert } from "@std/assert";
import { arb, repeatTest } from "@skybrian/repeat-test";

repeatTest(arb.string(), (s) => {
  assert(s.length >= 0); // Runs 1000 times.
});
```

When given an Arbitrary with up to a thousand examples, `repeatTest` does an
exhaustive test, much like iterating over a list of examples using a for loop.
Most of the time, though, the Arbitrary is larger than that, so it generates
1000 examples to run out of what might be a gigantic number of possibilities.
[^2]

It selects *mostly* randomly, but there is one exception: every Arbitrary is
required to have a *default value* [^3] and that example is always run first. For
`arb.string()`, the default is the empty string. This serves as a "smoke test;"
if your test fails with an empty string, there's not much point looking further.

Depending on how fast your test runs, you might want to adjust how many examples get chosen. This can be adjusted with the `reps` option:

```ts
repeatTest(arb.string(), (s) => {
  assert(s.length >= 0);
}, { reps: 100000 }); // Just to be really sure.
```

## What's a property test?

Tests written in this style are called *property tests*. This has nothing to do
with JavaScript properties. They're called that because each test has an
interpretation as a *mathematical* property. In this case, we are saying "for
all strings, length >= 0." This is a pretty trivial property, but it's
definitely mathematics.

The mathematical interpretation is only conceptual; our test can't prove that
statement because it's picking examples randomly, and even worse, large strings
won't be generated at all. But when you can define mathematical properties for a
function, it's helpful in clarifying what *counts* as a bug. [^4]

Also, even though `repeat-test` is not that smart about picking examples [^5],
random testing can still be pretty good at flushing out *trivial* bugs.
Sometimes it surprises me by finding a bug for a case I didn't think of.

## Adding a length constraint

Maybe you don't want to test with *any* string? Many arbitraries take options that restrict the examples they generate. All built-in Arbitraries that generate strings or arrays take a *length* constraint, which can be used like this:

```ts
repeatTest(arb.string({ length: 2 }), (s) => {
  assert(s.length === 2); // Uh, yeah, obvious.
});
```

You can also set lower or upper bounds:

```ts
repeatTest(arb.string({ length: { min: 1, max: 5 } }), (s) => {
  assert(s.length >= 1 && s.length <= 5);
});
```

## More to come

The `arb` namespace contains functions for defining other kinds of Arbitraries. The selection is still pretty limited compared to most property-testing frameworks, but *repeat-test* makes it pretty easy to define your own.

(To be continued.)

[^1]: This is true *conceptually*. In practice, `arb.string()` has an internal
    limit on the maximum length of strings it will generate, which you can
    override.

[^2]: It chooses between modes based on the `Arbitrary.maxSize` property, which
    is only defined for some Arbitraries and returns an upper bound on how many
    examples it contains.
    
[^3]: Yes, this implies that empty Arbitraries are not allowed in `repeat-test`.
    Other property-testing libraries have Arbitraries that work differently.

[^4]: Unlike, say, throwing an LLM at the problem.

[^5]: This is because it picks examples blindly. There are fuzz-testing
    libraries that are much better at finding rare bugs.