## 0.4.0

* API: add console.debugger() and console.sometimes().
* API: removed Arbitrary.default() method. (Now internal.)
* Changed the random distributions for array and string arbitraries so they sometimes generate the maximum allowed length.
* Arbitrary.filter() rejects filters that are too strict.
* Improved performance of arb.uniqueArray() and arb.table().
* Wrote [docs](./docs) about getting started and using Arbitraries.

## 0.3.0

* API: all array-like arbitraries and domains now take a length option
* API: removed label option on tables
* API: PickRequest's bias option takes a source of random int32's as input.
* API: PickRequest.bias => PickRequest.random
* Improved performance on generating strings and changed the character distribution

## 0.2.0

* Added separate entrypoints for parts of repeat-test
* Arbitrary.with() is now the only way to set a custom label
* arb.table() no longer requires a Domain for non-keys; rename uniqueKeys => keys
* Removed Domain.arb

## 0.1.2

* Changed Domain class to extend Arbitrary instead of containing an Arbitrary.
* Try to get README.md to show up on jsr.io.

## 0.1.1

* Oops, README and examples weren't published.

## 0.1.0

* First release pushed to jsr.io.
