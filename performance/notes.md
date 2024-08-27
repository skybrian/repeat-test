## Version 0.2.0

```
Check file:///Users/skybrian/Projects/deno/repeat-test/performance/benchmarks.ts
cpu: Apple M2
runtime: deno 1.46.1 (aarch64-apple-darwin)

file:///Users/skybrian/Projects/deno/repeat-test/performance/benchmarks.ts
benchmark              time (avg)        iter/s             (min … max)       p75       p99      p995
----------------------------------------------------------------------- -----------------------------
generate a string      17.87 µs/iter      55,947.2    (16.38 µs … 2.74 ms) 17.29 µs 22.21 µs 29.79 µs
```

### After adding special case for coin flip:

```
cpu: Apple M2
runtime: deno 1.46.1 (aarch64-apple-darwin)

file:///Users/skybrian/Projects/deno/repeat-test/performance/benchmarks.ts
benchmark              time (avg)        iter/s             (min … max)       p75       p99      p995
----------------------------------------------------------------------- -----------------------------
generate a string      11.79 µs/iter      84,832.0  (10.88 µs … 174.21 µs) 11.58 µs 15.25 µs 26.88 µs
```

### After adding special case for size 128:

```
cpu: Apple M2
runtime: deno 1.46.1 (aarch64-apple-darwin)

file:///Users/skybrian/Projects/deno/repeat-test/performance/benchmarks.ts
benchmark              time (avg)        iter/s             (min … max)       p75       p99      p995
----------------------------------------------------------------------- -----------------------------
generate a string        9.3 µs/iter     107,550.0   (7.96 µs … 107.54 µs) 9.17 µs 11.92 µs 21.08 µs
```

### After removing dependency on pure-rand for uniform distributions

```
cpu: Apple M2
runtime: deno 1.46.1 (aarch64-apple-darwin)

file:///Users/skybrian/Projects/deno/repeat-test/performance/benchmarks.ts
benchmark              time (avg)        iter/s             (min … max)       p75       p99      p995
----------------------------------------------------------------------- -----------------------------
generate a string       9.77 µs/iter     102,364.6   (8.67 µs … 120.04 µs) 9.62 µs 12.96 µs 18.25 µs
```

###  After migrating to PickRequest.random

```
cpu: Apple M2
runtime: deno 1.46.1 (aarch64-apple-darwin)

file:///Users/skybrian/Projects/deno/repeat-test/performance/benchmarks.ts
benchmark              time (avg)        iter/s             (min … max)       p75       p99      p995
----------------------------------------------------------------------- -----------------------------
generate a string       9.56 µs/iter     104,569.7   (8.58 µs … 107.42 µs) 9.38 µs 13.04 µs 22.88 µs
```