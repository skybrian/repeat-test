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

### After optimizing char16.random

```
cpu: Apple M2
runtime: deno 1.46.1 (aarch64-apple-darwin)

file:///Users/skybrian/Projects/deno/repeat-test/performance/benchmarks.ts
benchmark              time (avg)        iter/s             (min … max)       p75       p99      p995
----------------------------------------------------------------------- -----------------------------
generate a string        6.3 µs/iter     158,679.8   (5.62 µs … 115.83 µs) 6.12 µs 8.12 µs 9.25 µs
```

## 0.3.0

### After changing multipass search to widen gradually

```
cpu: Apple M2
runtime: deno 1.46.1 (aarch64-apple-darwin)

file:///Users/skybrian/Projects/deno/repeat-test/performance/benchmarks.ts
benchmark              time (avg)        iter/s             (min … max)       p75       p99      p995
----------------------------------------------------------------------- -----------------------------
generate a string       6.89 µs/iter     145,032.6   (6.12 µs … 146.38 µs) 6.71 µs 9.33 µs 14.08 µs
take 10k char16       121.09 ms/iter           8.3 (120.51 ms … 121.99 ms) 121.44 ms 121.99 ms 121.99 ms
```

### After making Walk.prune() a little faster

```
cpu: Apple M2
runtime: deno 1.46.1 (aarch64-apple-darwin)

file:///Users/skybrian/Projects/deno/repeat-test/performance/benchmarks.ts
benchmark              time (avg)        iter/s             (min … max)       p75       p99      p995
----------------------------------------------------------------------- -----------------------------
generate a string       6.97 µs/iter     143,492.6   (6.17 µs … 108.25 µs) 6.83 µs 7.54 µs 9.58 µs
take 10k char16       115.15 ms/iter           8.7 (114.18 ms … 116.82 ms) 115.6 ms 116.82 ms 116.82 ms
```

### After making Walk.trim() faster

```
cpu: Apple M2
runtime: deno 1.46.1 (aarch64-apple-darwin)

file:///Users/skybrian/Projects/deno/repeat-test/performance/benchmarks.ts
benchmark              time (avg)        iter/s             (min … max)       p75       p99      p995
----------------------------------------------------------------------- -----------------------------
generate a string       6.85 µs/iter     145,964.1   (6.08 µs … 111.62 µs) 6.71 µs 8.67 µs 9.75 µs
take 10k char16        89.91 ms/iter          11.1   (89.25 ms … 92.37 ms) 90.06 ms 92.37 ms 92.37 ms
```

### After changing Walk to not pop pickPath

```
cpu: Apple M2
runtime: deno 1.46.1 (aarch64-apple-darwin)

file:///Users/skybrian/Projects/deno/repeat-test/performance/benchmarks.ts
benchmark              time (avg)        iter/s             (min … max)       p75       p99      p995
----------------------------------------------------------------------- -----------------------------
generate a string       6.88 µs/iter     145,306.6   (6.12 µs … 103.12 µs) 6.75 µs 7.92 µs 10.96 µs
take 10k char16        84.77 ms/iter          11.8   (84.36 ms … 86.29 ms) 84.82 ms 86.29 ms 86.29 ms
```

### After changing Walk to not pop its lists

```
cpu: Apple M2
runtime: deno 1.46.1 (aarch64-apple-darwin)

file:///Users/skybrian/Projects/deno/repeat-test/performance/benchmarks.ts
benchmark              time (avg)        iter/s             (min … max)       p75       p99      p995
----------------------------------------------------------------------- -----------------------------
generate a string       6.84 µs/iter     146,134.7   (6.08 µs … 178.17 µs) 6.71 µs 7.96 µs 9.5 µs
take 10k char16        74.58 ms/iter          13.4   (74.04 ms … 76.03 ms) 74.64 ms 76.03 ms 76.03 ms
```

### After optimizing Note.prune

```
cpu: Apple M2
runtime: deno 1.46.1 (aarch64-apple-darwin)

file:///Users/skybrian/Projects/deno/repeat-test/performance/benchmarks.ts
benchmark              time (avg)        iter/s             (min … max)       p75       p99      p995
----------------------------------------------------------------------- -----------------------------
generate a string        6.9 µs/iter     144,927.5   (6.08 µs … 108.04 µs) 6.71 µs 9.21 µs 13.96 µs
take 10k char16        66.75 ms/iter          15.0    (66.4 ms … 68.67 ms) 66.77 ms 68.67 ms 68.67 ms
```

### After changing PlayoutSource to not pop requests

```
cpu: Apple M2
runtime: deno 1.46.1 (aarch64-apple-darwin)

file:///Users/skybrian/Projects/deno/repeat-test/performance/benchmarks.ts
benchmark              time (avg)        iter/s             (min … max)       p75       p99      p995
----------------------------------------------------------------------- -----------------------------
generate a string       6.81 µs/iter     146,842.9    (6.04 µs … 243.5 µs) 6.67 µs 8.58 µs 9.58 µs
take 10k char16        52.65 ms/iter          19.0   (52.22 ms … 55.25 ms) 52.62 ms 55.25 ms 55.25 ms
```

### After inlining code into take()

```
    CPU | Apple M2
Runtime | Deno 1.46.2 (aarch64-apple-darwin)

file:///Users/skybrian/Projects/deno/repeat-test/performance/benchmarks.ts

benchmark           time/iter (avg)        iter/s      (min … max)           p75      p99     p995
------------------- ----------------------------- --------------------- --------------------------
generate a string            4.4 µs       224,900 (  3.9 µs … 185.1 µs)   4.3 µs   5.5 µs   6.1 µs
take 10k char16             31.4 ms          31.8 ( 31.1 ms …  31.9 ms)  31.7 ms  31.9 ms  31.9 ms
```

### After pruning minimum picks from current pass that were already pruned in a previous pass

```
    CPU | Apple M2
Runtime | Deno 1.46.2 (aarch64-apple-darwin)

file:///Users/skybrian/Projects/deno/repeat-test/performance/benchmarks.ts

benchmark               time/iter (avg)        iter/s      (min … max)           p75      p99     p995
----------------------- ----------------------------- --------------------- --------------------------
generate a string                4.5 µs       221,200 (  3.9 µs … 143.0 µs)   4.4 µs   5.5 µs   6.2 µs
take 10k char16                  4.0 ms         247.9 (  3.9 ms …   4.6 ms)   4.1 ms   4.3 ms   4.6 ms
uniqueArray of 5 ints           63.9 ms          15.6 ( 63.4 ms …  65.9 ms)  63.8 ms  65.9 ms  65.9 ms
```

### After changing multipass search to narrow width with depth

```
    CPU | Apple M2
Runtime | Deno 1.46.2 (aarch64-apple-darwin)

file:///Users/skybrian/Projects/deno/repeat-test/performance/benchmarks.ts

benchmark               time/iter (avg)        iter/s      (min … max)           p75      p99     p995
----------------------- ----------------------------- --------------------- --------------------------
generate a string                4.5 µs       223,300 (  3.8 µs … 189.7 µs)   4.4 µs   5.4 µs   6.1 µs
take 10k char16                  4.0 ms         247.8 (  4.0 ms …   4.6 ms)   4.1 ms   4.3 ms   4.6 ms
uniqueArray of 5 ints           11.8 ms          85.0 ( 11.6 ms …  12.2 ms)  11.8 ms  12.2 ms  12.2 ms
```