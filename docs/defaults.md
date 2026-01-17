# Default Values for Built-in Arbitraries

Every Arbitrary has a default value. When `repeatTest` runs, it tests the
default value first as a smoke test before generating random values.

This table shows the default values for common Arbitraries:

| Arbitrary | Code | Default Value |
|-----------|------|---------------|
| int (positive range) | `arb.int(1, 100)` | `1` |
| int (negative range) | `arb.int(-100, -1)` | `-1` |
| int (spans zero) | `arb.int(-100, 100)` | `0` |
| int32 | `arb.int32()` | `0` |
| safeInt | `arb.safeInt()` | `0` |
| boolean | `arb.boolean()` | `false` |
| biased | `arb.biased(0.9)` | `false` |
| string | `arb.string()` | `""` |
| wellFormedString | `arb.wellFormedString()` | `""` |
| asciiLetter | `arb.asciiLetter()` | `"a"` |
| asciiDigit | `arb.asciiDigit()` | `"0"` |
| asciiWhitespace | `arb.asciiWhitespace()` | `" "` |
| char16 | `arb.char16()` | `"a"` |
| unicodeChar | `arb.unicodeChar()` | `"a"` |
| array | `arb.array(arb.int(0, 10))` | `[]` |
| array (fixed length) | `arb.array(arb.int(0, 10), { length: 3 })` | `[0,0,0]` |
| object | `arb.object({ a: arb.int(1, 5), b: arb.boolean() })` | `{"a":1,"b":false}` |
| of | `arb.of("a", "b", "c")` | `"a"` |
| oneOf | `arb.oneOf(arb.of(1), arb.of(2), arb.of(3))` | `1` |

## Notes

- `arb.int(min, max)`: Default is `min` for positive ranges, `-1` for negative ranges, or `0` if the range spans zero.
- `arb.boolean()`: Default is `false`.
- `arb.string()` and other string arbitraries: Default is the empty string `""`.
- `arb.array(...)`: Default is an empty array `[]`, unless a fixed length is specified.
- `arb.of(...)`: Default is the first value.
- `arb.oneOf(...)`: Default comes from the first case.
- `arb.object(...)`: Default has each property set to its arbitrary's default.

When writing custom Arbitraries with `arb.from()`, the default is determined by
each nested `pick()` call returning its own default value.
