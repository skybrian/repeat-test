import { assertEquals } from "@std/assert";
import { arb, repeatTest } from "@skybrian/repeat-test";

// Here are some buggy functions to test:

function badEncode(input: string[]): string {
  if (input.length === 0) return "";
  return input.join(",") + ",";
}

function badDecode(input: string): string[] {
  if (input === "") return [];
  return input.split(",").slice(0, -1);
}

// Here's how specify the test input.
// We want to encode arbitrary arrays of strings:
const input = arb.array(arb.string());

// Run the test with up to 1000 examples.
// The first will be an empty array, and the rest will be random.
repeatTest(input, (original, console) => {
  const encoded = badEncode(original);
  console.log("encoded as", `'${encoded}'`); // Has no effect unless the test fails.

  const copy = badDecode(encoded);
  assertEquals(copy, original);
});

// Expected output: the test should fail pretty quickly.
