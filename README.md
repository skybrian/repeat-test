The *repeat-test* library is my attempt to come up with a nicer API for writing property tests in TypeScript.

## Attention conservation notice

This library is brand new, incomplete, and should be considered experimental.
I've only used *repeat-test* to test itself. It only works with Deno. I don't plan to stabilize the API or support more platforms until
I've gained more experience with it.

Also, though it seems promising, I don't know how long I'll keep working on it!

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
};
```

The first argument to `repeatTest` provides a way of generating examples. The
second argument is a test function to run repeatedly that takes an example as input. A repetition ("rep" for short) passes if the test function completes normally.

Since the test passes, it won't print anything.

## Generating test data with Arbitraries

So far, we haven't used `repeatTest` to do anything that you need a library for. But like with other property-testing frameworks, we can generate test data using an *Arbitrary*:

```ts
import { assertEquals } from "@std/assert";
import { arb, repeatTest } from "../main.ts";

// Some buggy functions to test:

function badEncode(input: string[]): string {
  if (input.length === 0) return "";
  return input.join(",") + ",";
}

function badDecode(input: string): string[] {
  if (input === "") return [];
  return input.split(",").slice(0, -1);
}

// A round-trip test:

const input = arb.array(arb.string());
repeatTest(input, (original) => {
  const copy = badDecode(badEncode(original));
  assertEquals(copy, original);
});
```

The test fails pretty quickly:

```
% deno run split.ts

Test failed. Shrinking...
attempt 3 FAILED, using: [ "," ]
rerun using {only: "1659315698:3"}
error: Uncaught (in promise) AssertionError: Values are not equal.


    [Diff] Actual / Expected


    [
-     "",
-     "",
+     ",",
    ]

  throw new AssertionError(message);
        ^
    at assertEquals (https://jsr.io/@std/assert/1.0.2/equals.ts:47:9)
    at Object.test (file:///Users/skybrian/Projects/deno/repeat-test/examples/split.ts:24:3)
    [redacted]
```

TODO: write more docs!
