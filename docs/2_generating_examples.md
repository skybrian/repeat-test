# Part 2: Generating Examples

## Introducing Arbitraries

In [Part 1](./1_getting_started.md) we saw a test that uses two examples, defined like this:

```ts
const examples = ["hello", "world"];
```

Here's how to do the same thing using an *Arbitrary* instead:

```ts
import { arb } from "@skybrian/repeat-test";

const examples = arb.of("hello", "world"); // Not an array anymore.
```

The type of *examples* is now `Arbitrary<string>`, but it contains the same
data, and `repeatTest` function will run the same examples.

Each Arbitrary represents a set of possible examples. Arbitraries can represent
small or large sets, sometimes *very* large; for example, `arb.string()`
is the set of all possible small strings. Arbitraries *usually* generate
fresh examples on demand, but `arb.of` is different; it picks from the examples
it's given and returns them as-is. [^1]

## Random testing

We can pass a very large Arbitrary to `repeatTest` and it works fine:

```ts
import { assert } from "@std/assert";
import { arb, repeatTest } from "@skybrian/repeat-test";

repeatTest(arb.string(), (s) => {
  assert(s.length >= 0); // Runs 1001 times.
});
```

This will run the test with the empty string, followed by a thousand more
randomly generated strings. 

More generally, every Arbitrary is required to have a *default value*. [^2] In
this case, the empty string. The `repeatTest` function always calls the test
function first with the Arbitrary's default, as a "smoke test." If the test
fails with the default value, there's not much point looking further.

Then it runs the test a thousand more times with randomly selected examples.

Depending on how fast your test runs, you might want to adjust how many values
`repeatTest` selects randomly. This can be adjusted with the `reps` option:

```ts
repeatTest(arb.string(), (s) => {
  assert(s.length >= 0);
}, { reps: 100000 }); // Just to be really sure.
```

## Learning more about randomly-generated examples

When we generate examples randomly instead of writing them out explicitly, our
tests become shorter, more abstract, and in some ways, harder to review; it's
difficult to say whether or not a specific case is covered. There's a danger
that we will get a false sense of security about our test coverage.

A *sometimes* assertion can help with that. For example, let's say we want to
know whether `arb.string()` automatically includes strings that are long enough
to test something we care about. Here's how to explicitly assert that:

```ts
repeatTest(arb.string(), (s, console) => {
  console.sometimes("s is long enough", s.length >= 50);
});
```

*Sometimes* assertions can be useful documentation, informing the reader that a
particular case is covered. They also help ensure that a project's test coverage
doesn't regress. For example, if the probability distribution for `arb.string()`
were to change in a new release of *repeat-test,* a failed *sometimes* assertion
would reveal that a test no longer covers what it should.

## What's a property test?

Tests written in this style are called *property tests*. This has nothing to do
with JavaScript properties. They're called that because each test has an
interpretation as a *mathematical* property. For example, we wrote a test that
seems to be evidence for the assertion that "for all strings, length >= 0." It's
a trivial mathemetical statement, and for JavaScript strings, we're pretty sure
it's true.

But it's important to remember that a mathematical interpretation of a property
test is *conceptual* and sometimes misleading; the tests do something different.
Consider that this test also passes:

```ts
repeatTest(arb.string(), (s) => {
  assert(!s.includes("fnord"));
});
```

It might look like we've shown that JavaScript strings can never contain the
string `"fnord"`, which would be pretty bizarre and self-contradictory. But what
it's really saying is that, for the probability distribution used by
`arb.string()`, strings that contain specific words are rare.

It's helpful to define the mathematical properties for a function because it
clarifies what *counts* as a bug. Also, a property test helps us gain confidence
that the property is rarely false. Such tests can surprise us by finding a new
bug. But *rarely false* isn't the same as *always true.*

Here's another assertion that might look a little strange:

```ts
repeatTest(arb.string(), (s) => {
  assert(s.length <= 1000);
});
```

This is because by default, `arb.string` only generates *small* strings with length up to a thousand. 

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
Arbitraries it finds in the array. [^3]

So, a reader can be sure that all the examples they see are tested, and many
more that are generated by the Arbitraries.

## More inputs

So far we've only seen tests that rely on a single input. To learn about the
different ways to generate *multiple* inputs, see [Part
3](./3_multiple_inputs.md).

[^1]: Since the values won't be regenerated, `arb.of()` requires them to be
    *frozen*. This is automatically true for strings. For non-primitive objects,
    you can use `Object.freeze()`.

[^2]: Yes, this means empty Arbitraries are not allowed in `repeat-test`.
    Other property-testing libraries have Arbitraries that work differently.

[^3]: What if the Arbitraries don't *have* 1000 examples total? In that case,
    `repeat-test` stops when it runs out. For small Arbitraries, `repeatTest`
    will do an exhaustive search, but in random order. For *large* Arbitraries,
    it's not possible to run out of examples, so duplicate tracking is partially
    disabled to save memory. As a result, duplicates are improbable, but could
    still theoretically happen.
