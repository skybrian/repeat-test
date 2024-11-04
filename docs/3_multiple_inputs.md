# Part 3: Multiple inputs

## Independent choices

In [Part 2](./2_generating_examples.md) we saw that `arb.string()` is very
unlikely to generate particular substrings by chance:

```ts
repeatTest(arb.string(), (s) => {
  assert(!s.includes("fnord"));
});
```

But we can make that happen by generating two strings and combining them:

```ts
const example = arb.object({
  prefix: arb.string(),
  suffix: arb.string(),
});

repeatTest(example, ({ prefix, suffix }) => {
  const s = prefix + "fnord" + suffix;
  assert(s.includes("fnord"));
});
```

The `arb.object()` function returns an Arbitrary that generates JavaScript
objects with a fixed list of properties. The value of each property is chosen
independently. That's just what we want in this case: there should be no
relationship between the prefix and the suffix. [^1]

## A choice that depends on a previous choice

Sometimes you might want to generate two values where the second value somehow
depends on the first. Here is an example that generates a random string and then
a random offset into that string:

```ts
const example = arb.from((pick) => {
  const s = pick(arb.string());
  const offset = pick(arb.int(0, s.length));
  return { s, offset };
});

repeatTest(example, ({ s, offset }) => {
  assert(offset >= 0 && offset <= s.length);
});
```

The `arb.from()` function takes a callback function that generates one random
value per call. The callback is given a *pick function* that it can use to
generate random values from Arbitraries. First it chooses a string, and then
chooses an integer with the appropriate range, from zero up to and including the
string's length. (Specifically, the `arb.int()` function creates an Arbitrary
that has the requested range, which is passed immediately to `pick`.)

This is a very flexible way to create an Arbitrary, but to work properly, the
callback has to follow some rules:

1. Whenever it needs to make a random choice, it has to call `pick` to do it.

2. The return value needs to be determined by the values it gets back from the
   calls it makes to `pick`. That is, when we run the callback twice, the same
   picks will generate the same return value. [^2]

This is because sometimes `repeatTest` will rerun a test using the same picks,
and the result must always be equivalent as far as tests are concerned, or test
failures won't be reproducible. 

## More Arbitraries

You can browse the `arb` namespace to learn about functions that define other
kinds of Arbitraries. The selection is still pretty limited compared to most
property-testing frameworks, but *repeat-test* makes it easy to define your own.

(To be continued.)

[^1]: Like a cross join in SQL, the number of possible values escalates quickly.
Considered in terms of sets, `arb.object()` takes multiple sets (Arbitraries) as
input and returns a much bigger set as output. To get the size of the output
set, you *multiply* the sizes of each *occurrence* of an input set.

[^2]: Equivalent outputs don't have to be equal according to `===` or
    `assertEquals()`. Generating different values is allowed so long as the test
    passes or fails the same way. For mutable values, `arb.from` should generate
    a fresh value each time.
