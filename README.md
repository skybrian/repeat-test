The *repeat-test* library is my attempt to come up with a nicer API for writing property tests in TypeScript.

## Warning

While well-tested, this library is new and incomplete. I use it in my own projects, but
haven't heard of anyone else using it. For now, this library only works with Deno.

The API should be considered unstable. I like to rename
symbols when I think of a better name and might still make major changes before it reaches 1.0 (if it ever does).

So if you use it, I recommend pinning to a specific version. Perhaps using
a coding agent will make upgrades easier?

If you're looking for a full-featured, popular, stable property-testing library, I recommend [fast-check](https://fast-check.dev/).

## Hello world

The main entry point is the `repeatTest` function. Here's how to use it as a
glorified while loop:

```ts
import { assertEquals } from "@std/assert";
import { repeatTest } from "@skybrian/repeat-test";

const examples = ["hello", "world"];

repeatTest(examples, (word) => {
  assertEquals(word.length, 5); // This will run twice.
});
```

The first argument to `repeatTest` provides a way of generating examples. The
second argument is a test function to run repeatedly that takes an example as input. A repetition ("rep" for short) passes if the test function completes normally.

## Documentation

See the [docs directory ](./docs/) for a longer introduction.
