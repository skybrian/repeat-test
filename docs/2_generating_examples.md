# Part 2: Generating Examples

## Introducing Arbitraries

In ["Part 1"]("../1_getting_started.md") we saw a test that uses two examples, defined using an array:

```
const examples = ["hello", "world"];
```

This is a shortcut that's accepted by the `repeatTest` function. Normally, when using the `repeat-test` framework, we define a set of examples like this:

```ts
import { arb } from "@skybrian/repeat-test";

const examples = arb.of("hello", "world");
```

The type of *examples* is now `Arbitrary<string>`, but it contains the same data and is used the same way by `repeatTest`.

An `Arbitrary` represents a set of examples. Some Arbitraries are tiny like this one, but they are often very large; for example, `arb.string()` represents the set of all strings. [^1] Arbitraries can generate a stream of examples that's practically infinite.

### Random testing

We can pass a very large Arbitrary to repeatTest and it still works:

```ts
import { assert } from "@std/assert";
import { arb, repeatTest } from "@skybrian/repeat-test";

repeatTest(arb.string(), (s) => {
  assert(s.length >= 0); // Runs 1000 times.
});
```

When given an Arbitrary with up to a thousand examples, `repeatTest` does an exhaustive test, much like iterating over a list of examples using a for loop. Most of the time, though, the Arbitrary is larger than that, so it chooses 1000 examples to run out of a gigantic number of possibilities. [^2]

It selects *mostly* randomly, but there is one exception: every Arbitrary is required to have a *default* [^3] and that example is always run first. For `arb.string()`, the default is the empty string. This serves as a "smoke test;" if your test doesn't work with an empty string, there's not much point looking further.

Random testing can never guarantee that your code is free of bugs, but it tends to do a good job of flushing out *trivial* bugs, and it's more likely to surprise you by finding a bug that you didn't think of.

Depending on how fast your test runs, you might want to adjust how many examples get chosen. This can be adjusted with the `reps` option:

```ts
repeatTest(arb.string(), (s) => {
  assert(s.length >= 0);
}, { reps: 100000 }); // Just to be really sure.
```

### Why is it a property test?

Tests written in this style are called *property tests*. Why do we call it that? It has nothing to do with JavaScript properties. It's because the test has an interpretation as a *mathematical* property. We are saying "for all strings, length >= 0." It's a simple statement, but definitely sounds like math.

Random testing can't *prove* statements like that, but to write such a test, it helps to think about what mathematical properties are always true for your code. Writing code that *has* mathematical properties [^4] often makes it less surprising to use.

### Adding a length constraint

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


### Filtering

Another thing you can do with *any* Arbitrary is filter out some values that you don't want to test with.

...

Filtering needs to be used with caution; if you filter out too much, `repeat-test` will get stuck searching for examples 

[^1]: In practice, there is a limit. Very large strings aren't actually generated.

[^2]: It chooses between modes based on the `Arbitrary.maxSize` property, which is only defined for Arbitraries that are known to be small.

[^3]: Yes, this implies that empty Arbitraries are not allowed in `repeat-test`. Other property-testing libraries also have Arbitraries, but they work differently.

[^4]: Or at least, we try.