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
generate a string                4.4 µs       225,300 (  3.8 µs … 210.9 µs)   4.3 µs   5.7 µs   6.1 µs
take 10k char16                  4.1 ms         243.2 (  4.0 ms …   6.1 ms)   4.1 ms   4.9 ms   6.1 ms
uniqueArray of 5 ints           11.2 ms          89.6 ( 11.1 ms …  11.3 ms)  11.2 ms  11.3 ms  11.3 ms
uniqueArray of 6 ints          150.6 ms           6.6 (148.0 ms … 159.2 ms) 151.2 ms 159.2 ms 159.2 ms
```

### Jar.take() now picks a value for all minimum picks

```
    CPU | Apple M2
Runtime | Deno 1.46.2 (aarch64-apple-darwin)

file:///Users/skybrian/Projects/deno/repeat-test/performance/benchmarks.ts

benchmark                 time/iter (avg)        iter/s      (min … max)           p75      p99     p995
------------------------- ----------------------------- --------------------- --------------------------
generate a string                  4.6 µs       217,600 (  4.0 µs … 198.7 µs)   4.5 µs   6.0 µs   6.4 µs
take 10k char16                    4.1 ms         246.3 (  3.9 ms …   4.5 ms)   4.1 ms   4.3 ms   4.5 ms
uniqueArray of 5 ints             18.2 µs        54,960 ( 16.5 µs … 537.5 µs)  17.6 µs  26.7 µs  50.4 µs
uniqueArray of 6 ints             19.8 µs        50,490 ( 18.6 µs … 130.3 µs)  19.5 µs  21.0 µs  83.7 µs
uniqueArray of 100 ints          246.1 µs         4,064 (233.6 µs … 372.0 µs) 242.7 µs 355.8 µs 363.6 µs
```

### Partially track duplicates for random generation 

```
    CPU | Apple M2
Runtime | Deno 1.46.3 (aarch64-apple-darwin)

file:///Users/skybrian/Projects/deno/repeat-test/performance/benchmarks.ts

benchmark                 time/iter (avg)        iter/s      (min … max)           p75      p99     p995
------------------------- ----------------------------- --------------------- --------------------------
generate a string                  4.6 µs       217,300 (  4.0 µs … 143.7 µs)   4.5 µs   5.4 µs   6.2 µs
take 10k char16                    4.1 ms         241.4 (  4.1 ms …   4.7 ms)   4.2 ms   4.5 ms   4.7 ms
uniqueArray of 5 ints             18.1 µs        55,260 ( 16.5 µs … 605.5 µs)  17.5 µs  28.4 µs  75.4 µs
uniqueArray of 6 ints             20.2 µs        49,610 ( 18.8 µs … 448.0 µs)  19.8 µs  24.0 µs  91.2 µs
uniqueArray of 100 ints          253.8 µs         3,941 (243.4 µs … 357.6 µs) 247.9 µs 336.7 µs 337.9 µs
generate 10k strings              78.0 ms          12.8 ( 77.3 ms …  80.5 ms)  78.0 ms  80.5 ms  80.5 ms
```

### arb.array() and arb.string() sometimes generate arrays of maximum length

```
    CPU | Apple M2
Runtime | Deno 1.46.3 (aarch64-apple-darwin)

file:///Users/skybrian/Projects/deno/repeat-test/performance/benchmarks.ts

benchmark                 time/iter (avg)        iter/s      (min … max)           p75      p99     p995
------------------------- ----------------------------- --------------------- --------------------------
generate a string                  5.8 µs       171,900 (  4.9 µs … 406.6 µs)   5.7 µs   7.8 µs  11.4 µs
take 10k char16                    4.4 ms         224.8 (  4.0 ms …   6.6 ms)   4.6 ms   5.9 ms   6.6 ms
uniqueArray of 5 ints             27.2 µs        36,760 ( 22.3 µs … 898.3 µs)  25.4 µs 104.3 µs 143.5 µs
uniqueArray of 6 ints             30.6 µs        32,640 ( 25.2 µs …   1.6 ms)  28.1 µs 109.2 µs 152.9 µs
uniqueArray of 100 ints          351.0 µs         2,849 (320.2 µs … 660.8 µs) 348.7 µs 495.9 µs 507.9 µs
generate 10k strings              86.6 ms          11.5 ( 85.9 ms …  88.8 ms)  86.9 ms  88.8 ms  88.8 ms
```

### add benchmark for shrinking:

```
    CPU | Apple M2
Runtime | Deno 1.46.3 (aarch64-apple-darwin)

file:///Users/skybrian/Projects/deno/repeat-test/performance/benchmarks.ts

benchmark                 time/iter (avg)        iter/s      (min … max)           p75      p99     p995
------------------------- ----------------------------- --------------------- --------------------------
generate a string                  7.1 µs       141,500 (  6.4 µs … 156.5 µs)   6.9 µs   8.9 µs  10.8 µs
take 10k char16                    4.1 ms         242.8 (  4.1 ms …   4.8 ms)   4.2 ms   4.5 ms   4.8 ms
uniqueArray of 5 ints             26.3 µs        38,060 ( 24.1 µs … 515.0 µs)  25.1 µs  55.5 µs  92.2 µs
uniqueArray of 6 ints             28.8 µs        34,670 ( 27.4 µs … 361.2 µs)  28.3 µs  38.6 µs  94.5 µs
uniqueArray of 100 ints          333.3 µs         3,000 (316.2 µs … 466.6 µs) 328.2 µs 446.2 µs 449.2 µs
generate 10k strings             102.4 ms           9.8 (101.7 ms … 104.9 ms) 102.5 ms 104.9 ms 104.9 ms
shrink a 1k string                55.5 ms          18.0 ( 55.3 ms …  55.9 ms)  55.7 ms  55.9 ms  55.9 ms
```

### 0.4.0 release

```
    CPU | Apple M2
Runtime | Deno 1.46.3 (aarch64-apple-darwin)

file:///Users/skybrian/Projects/deno/repeat-test/performance/benchmarks.ts

benchmark                 time/iter (avg)        iter/s      (min … max)           p75      p99     p995
------------------------- ----------------------------- --------------------- --------------------------
generate a string                  5.5 µs       182,200 (  4.9 µs … 139.7 µs)   5.3 µs   7.4 µs   8.2 µs
take 10k char16                    4.1 ms         241.8 (  4.0 ms …   4.9 ms)   4.2 ms   4.4 ms   4.9 ms
uniqueArray of 5 ints             27.2 µs        36,740 ( 24.5 µs … 460.7 µs)  26.0 µs  66.9 µs 101.8 µs
uniqueArray of 6 ints             29.4 µs        33,990 ( 27.7 µs … 286.0 µs)  28.7 µs  41.2 µs  99.0 µs
uniqueArray of 100 ints          339.2 µs         2,948 (321.4 µs … 509.0 µs) 330.8 µs 450.3 µs 460.5 µs
generate 10k strings              86.5 ms          11.6 ( 85.0 ms …  89.7 ms)  86.7 ms  89.7 ms  89.7 ms
shrink a 1k string                56.6 ms          17.7 ( 56.1 ms …  58.8 ms)  56.6 ms  58.8 ms  58.8 ms
```