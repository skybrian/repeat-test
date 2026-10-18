The _repeat-test_ library is my attempt to come up with a nicer API for writing
property tests in TypeScript. It should work in Deno and Bun.

As far as I know, nobody uses this library but me. You're welcome to use it, but
I recommend pinning the version because I don't guarantee backward
compatibility.

If you're looking for a full-featured, popular, stable property-testing library,
I recommend [fast-check](https://fast-check.dev/).

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
second argument is a test function to run repeatedly that takes an example as
input. A repetition ("rep" for short) passes if the test function completes
normally.

## Documentation

See the [docs directory](./docs/) for a longer introduction.

For development, see [test coverage commands](./docs/testing.md) to compare
API-only coverage with the full suite and inspect gaps in individual source
files.
