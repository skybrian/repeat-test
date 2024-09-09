# Part 2: Generating Examples

## Introducing Arbitraries

In [Part 1](./1_getting_started.md) we saw a test that uses two examples, defined like this:

```ts
const examples = ["hello", "world"];
```

Here's how to do it using an *Arbitrary* instead:

```ts
import { arb } from "@skybrian/repeat-test";

const examples = arb.of("hello", "world"); // Not an array anymore.
```

The type of *examples* is now `Arbitrary<string>`, but it contains the same
data, and `repeatTest` function will run the same examples.

An Arbitrary represents a set of possible examples. Arbitraries can represent
small or large sets, sometimes *very* large; for example, `arb.string()`
represents the set of all possible strings. Arbitraries *usually* generate
fresh examples on demand, but `arb.of` is different; it picks from the examples
it's given and returns them as-is.

## Random testing

We can pass a very large Arbitrary to `repeatTest` and it works fine:

```ts
import { assert } from "@std/assert";
import { arb, repeatTest } from "@skybrian/repeat-test";

repeatTest(arb.string(), (s) => {
  assert(s.length >= 0); // Runs 1001 times.
});
```

Every Arbitrary is required to have a default value [^1]. The `repeatTest`
function always calls the test function first with the Arbitrary's default, as a
"smoke test." If the test fails with the default value, there's not much point
looking further.

Then it runs the test a thousand more times with randomly selected examples.

Depending on how fast your test runs, you might want to adjust how many values
it selects randomly. This can be adjusted with the `reps` option:

```ts
repeatTest(arb.string(), (s) => {
  assert(s.length >= 0);
}, { reps: 100000 }); // Just to be really sure.
```

## Learning more about randomly-generated examples

When we generate examples randomly instead of writing them out explicitly, our
tests become shorter, more abstract, and in some ways, harder to review: it's
difficult to say whether or not specific cases are covered. There's a danger
that we will get a false sense of security about our test coverage.

A *sometimes* assertion can help with that. For example, let's say we want to
know whether `arb.string()` automatically includes strings that are long enough
to test something we care about. Here's how to explicitly assert that:

```ts
repeatTest(arb.string(), (s, console) => {
  console.sometimes("s is long enough", s.length >= 50);
});
```

*Sometimes* assertions inform someone reading the code that a case is covered
and can also help ensure that a project's test coverage doesn't regress. (For
example, `arb.string()`'s random distribution might change in a new release of
*repeat-test.*)

## What's a property test?

Tests written in this style are called *property tests*. This has nothing to do
with JavaScript properties. They're called that because each test has an
interpretation as a *mathematical* property. For example, we wrote a test that
seems to be saying "for all strings, length >= 0." It's a trivial mathametical
statement. For JavaScript strings, we're pretty sure it's true.

But it's important to remember that the mathematical interpretation is
*conceptual* and somewhat misleading; the tests do something different. Our test
can't prove the statement it seems to imply because it's picking examples
randomly, and even worse, large strings won't be generated at all! (You can
prove this by adjusting the *sometimes* assertion to give it a larger length.)

It's helpful to define the mathematical properties for a function because it
clarifies what *counts* as a bug. In this way, property tests can serve as
useful documentation. Running the tests helps us gain confidence that the
property isn't trivially false, and sometimes they can surprise us by finding a
new bug. But bugs can still happen where we're not testing.

## Using length constraints

Maybe you don't want to test with *any* string, or you're specifically
interested in *large* strings? Many arbitraries take options that adjust the
examples they generate. All built-in Arbitraries that generate strings or arrays
take a *length* constraint, which can be used like this:

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

## Combining deterministic and random testing

We can get the best of both worlds using an array that contains both examples and Arbitraries:

```ts
import { assert } from "@std/assert";
import { arb, type Examples, repeatTest } from "@skybrian/repeat-test";

const examples: Examples<string> = [
  "hello",
  "world",
  "fnord",
  arb.string(),
];

repeatTest(examples, (s) => {
  assert(s.length >= 0); // runs 1004 times
});
```

When given an array, `repeatTest` starts by running the test on each element in
the array. When it finds an Arbitrary, it uses its default value. Then it
randomly generates 1000 additional examples, picking randomly from the
Arbitraries it finds in the array. [^2]

So, a reviewer can be sure that all the examples they see are tested, and many
more that are generated by the Arbitraries.

## More Arbitraries

You can browse the `arb` namespace to learn about functions that define other
kinds of Arbitraries. The selection is still pretty limited compared to most
property-testing frameworks, but *repeat-test* makes it pretty easy to define
your own.

(To be continued.)

[^1]: Yes, this means empty Arbitraries are not allowed in `repeat-test`.
    Other property-testing libraries have Arbitraries that work differently.

[^2]: Unless the Arbitraries don't *have* 1000 examples total. It keeps track of
    which examples it already ran and will stop if it runs out. So for small
    Arbitraries, `repeatTest` ends up doing an exhaustive search anyway, but in
    random order.

    For *large* Arbitraries, duplicate tracking is partially disabled to save
    memory, but in a way that still makes duplicates unlikely.
