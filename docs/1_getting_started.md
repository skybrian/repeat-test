# Getting Started

## Hello world

A test that calls the same function with different data is simple enough that
you could write it yourself with a for loop. But here is how to do it with the
**repeat-test** library instead:

```ts
import { assertEquals } from "@std/assert";
import { repeatTest } from "@skybrian/repeat-test";

const examples = ["hello", "world"];

repeatTest(examples, (word) => {
  assertEquals(word.length, 5); // This will run twice.
});
```

The first argument to `repeatTest` provides a way of generating examples. The
**repeat-test** library provides many ways to do that, but in this case, I
simply gave it an array of examples.

The second argument is a test function to run. It takes an example as its first
argument. Since there are only two examples, it will run twice.

 Here is how to run it:

 ```
 % deno ./examples/hello.ts                                                                                                              
 ```

Since the test passes, running it doesn't print anything.

Let's edit the test data so that it fails:

```ts
const examples = ["hello", "world!"]; // Second example is longer now.
```

When I run it again, the output looks like this:

```
% deno ./examples/hello.ts

Test failed. Shrinking...
attempt 2 FAILED, using: world!
rerun using {only: "0:1"}
error: Uncaught (in promise) AssertionError: Values are not equal.


    [Diff] Actual / Expected


-   6
+   5

  throw new AssertionError(message);
        ^
    at assertEquals (https://jsr.io/@std/assert/1.0.2/equals.ts:47:9)
    at Object.test (file:///Users/skybrian/Projects/deno/repeat-test/examples/hello.ts:7:3)
    at runRep (file:///Users/skybrian/Projects/deno/repeat-test/src/runner.ts:173:9)
    at runReps (file:///Users/skybrian/Projects/deno/repeat-test/src/runner.ts:201:17)
    at repeatTest (file:///Users/skybrian/Projects/deno/repeat-test/src/runner.ts:306:15)
    at file:///Users/skybrian/Projects/deno/repeat-test/examples/hello.ts:6:1
```

From the message we can see that it failed the second time, and it prints the example that failed. Sometimes that's all the information we need. However, let's say we wanted to debug it.

## Printing to the console

Using print statements to debug code is a time-honored tradition, but it can be
annoying when repeating a test, because a log message that prints for both
passing and failing test runs is pretty spammy. So, the `repeatTest` function
provides a better way:

```ts
repeatTest(examples, (word, console) => { // added another argument
  console.log("word:", word, "length:", word.length);
  assertEquals(word.length, 5);
});
```

The second, optional argument to the test function is a `TestConsole` object that does nothing, except when a test fails.

Running it looks like this:

```
% deno ./examples/hello.ts

Test failed. Shrinking...
word: world! length: 6
attempt 2 FAILED, using: world!
[rest is the same]
```

The console output appears on the second line. (It's not that useful in this case, but you can see that it worked.)

Notice that the test failed first, *then* its output was printed? This is
because a failed repetition gets run *again* with the TestConsole turned on. (A
failing test will run *many* times due to *shrinking*, about which more later.)

Normally we take `console.log` calls out when we're done debugging, but since
TestConsole output is normally suppressed, feel free to leave the log statement
in if you feel the output might be useful someday.

## Skipping to a failing test

In the output of the failed test run, `repeatTest` printed a message that looks like this:

```
rerun using {only: "0:1"}
```

This rather terse message is a hint that provides a way to skip over passing examples and get to the example that failed. Here is how to use it:

```ts
repeatTest(examples, (word, console) => {
  console.log("word:", word, "length:", word.length);
  assertEquals(word.length, 5);
}, {only: "0:1"}); // added the 'only' option
```

The third argument to `repeatTest` contains additional options that control which examples `repeatTest` runs. The `only` option causes it to skip ahead to one of the examples in the array. In this case, it's unnecessary (the output looks almost the same), but it might be handy when a test takes a long time to run.

Let's say we fix the code and accidentally leave the 'only' option turned on. It will still fail, as a reminder to remove it:

```
error: Uncaught (in promise) Error: only option is set
    throw new Error(`only option is set`);
          ^
    at repeatTest (file:///Users/skybrian/Projects/deno/repeat-test/src/runner.ts:312:11)
    at file:///Users/skybrian/Projects/deno/repeat-test/examples/hello.ts:6:1
```

## Using a test framework

The `repeatTest` function doesn't care which test framework you use, and as we've seen, you don't need a test framework at all to write and run a test.

But when you write many tests, it's often better to use a test framework. Here is how I do it using Deno's [bdd framework](https://docs.deno.com/runtime/fundamentals/testing/):

```ts
import { assertEquals } from "@std/assert";
import { repeatTest } from "@skybrian/repeat-test";
import { describe, it } from "@std/testing/bdd";

describe("String.length", () => {
  it("returns the right length for the words in a greeting", () => {
    const examples = ["hello", "world"];
    repeatTest(examples, (word) => {
      assertEquals(word.length, 5);
    });
  });
});
```

Since we're using a test framework now, we can use `deno test` to run the test:

```
% deno test examples/hello_bdd.ts 
Check file:///Users/skybrian/Projects/deno/repeat-test/examples/hello_bdd.ts
running 1 test from ./examples/hello_bdd.ts
String.length ...
  returns the right length for the words in a greeting ... ok (1ms)
String.length ... ok (0ms)

ok | 1 passed (1 step) | 0 failed (1ms)
```

Since repeatTest doesn't print anything itself for passing tests, all the output comes from the bdd framework.
