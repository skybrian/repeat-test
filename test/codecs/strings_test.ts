import { describe, it } from "@std/testing/bdd";
import * as arb from "../../src/arbitraries.ts";
import { assertRoundTrip } from "../../src/asserts.ts";
import { repeatTest } from "../../src/runner.ts";

import * as codec from "../../src/codecs.ts";

describe("Codec.asciiChar", () => {
    it("round-trips ascii characters", () => {
        repeatTest(arb.asciiChar(), (val) => {
            assertRoundTrip(codec.asciiChar(), val);
        });
    });
});

describe("Codec.char16", () => {
    it("round-trips single-character strings", () => {
        repeatTest(arb.char16(), (val) => {
            assertRoundTrip(codec.char16(), val);
        });
    });
});

describe("Codec.string", () => {
    it("round-trips strings", () => {
        repeatTest(arb.anyString(), (val) => {
            assertRoundTrip(codec.anyString(), val);
        });
    });
});
