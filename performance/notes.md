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

### After refactoring to ordered playouts (regression for uniqueArray)

```
    CPU | Apple M2
Runtime | Deno 1.46.3 (aarch64-apple-darwin)

file:///Users/skybrian/Projects/deno/repeat-test/performance/benchmarks.ts

benchmark                 time/iter (avg)        iter/s      (min … max)           p75      p99     p995
------------------------- ----------------------------- --------------------- --------------------------
generate a string                  5.3 µs       189,000 (  4.6 µs … 149.7 µs)   5.1 µs   7.1 µs   9.2 µs
take 10k char16                    4.8 ms         209.6 (  4.7 ms …   5.1 ms)   4.8 ms   5.1 ms   5.1 ms
uniqueArray of 5 ints             41.5 µs        24,120 ( 38.5 µs … 572.2 µs)  40.1 µs  71.1 µs 118.9 µs
uniqueArray of 6 ints             43.4 µs        23,060 ( 41.6 µs … 332.8 µs)  42.7 µs  56.8 µs 123.0 µs
uniqueArray of 100 ints          377.1 µs         2,652 (342.5 µs …   8.5 ms) 363.9 µs 567.0 µs 910.2 µs
generate 10k strings              80.9 ms          12.4 ( 80.6 ms …  83.2 ms)  80.8 ms  83.2 ms  83.2 ms
shrink a 1k string                54.1 ms          18.5 ( 53.8 ms …  54.5 ms)  54.1 ms  54.5 ms  54.5 ms
```

## After a bunch of refactoring

```
    CPU | Apple M2
Runtime | Deno 1.46.3 (aarch64-apple-darwin)

file:///Users/skybrian/Projects/deno/repeat-test/performance/benchmarks.ts

benchmark                 time/iter (avg)        iter/s      (min … max)           p75      p99     p995
------------------------- ----------------------------- --------------------- --------------------------
generate a string                  5.4 µs       186,100 (  4.8 µs … 130.7 µs)   5.2 µs   7.2 µs   8.9 µs
take 10k char16                    4.7 ms         213.8 (  4.6 ms …   5.1 ms)   4.7 ms   4.9 ms   5.1 ms
uniqueArray of 5 ints             55.0 µs        18,170 ( 46.8 µs …   1.1 ms)  50.8 µs 364.8 µs 415.3 µs
uniqueArray of 6 ints             56.5 µs        17,690 ( 50.0 µs …   1.2 ms)  51.5 µs 374.8 µs 428.1 µs
uniqueArray of 100 ints          493.5 µs         2,027 (437.4 µs …   2.2 ms) 452.4 µs 805.5 µs 853.6 µs
generate 10k strings              94.9 ms          10.5 ( 94.7 ms …  95.1 ms)  94.9 ms  95.1 ms  95.1 ms
shrink a 1k string                56.4 ms          17.7 ( 56.0 ms …  57.4 ms)  56.6 ms  57.4 ms  57.4 ms
```

## After getting to where splitCalls can be turned on for shrinking

```
    CPU | Apple M2
Runtime | Deno 2.0.0 (aarch64-apple-darwin)

file:///Users/skybrian/Projects/deno/repeat-test/performance/benchmarks.ts

benchmark                 time/iter (avg)        iter/s      (min … max)           p75      p99     p995
------------------------- ----------------------------- --------------------- --------------------------
generate a string                  5.3 µs       187,300 (  4.8 µs … 365.8 µs)   5.3 µs   6.2 µs   7.2 µs
take 10k char16                    4.2 ms         236.7 (  4.2 ms …   4.9 ms)   4.3 ms   4.4 ms   4.9 ms
uniqueArray of 5 ints             44.4 µs        22,500 ( 40.5 µs … 575.0 µs)  42.9 µs 107.3 µs 121.0 µs
uniqueArray of 6 ints             46.6 µs        21,480 ( 43.9 µs … 615.0 µs)  45.2 µs 108.8 µs 114.7 µs
uniqueArray of 100 ints          389.2 µs         2,569 (369.8 µs … 566.2 µs) 379.0 µs 500.4 µs 522.4 µs
generate 10k strings              92.7 ms          10.8 ( 88.6 ms …  95.6 ms)  92.9 ms  95.6 ms  95.6 ms
shrink a 1k string                60.7 ms          16.5 ( 60.4 ms …  61.3 ms)  60.8 ms  61.3 ms  61.3 ms
```

### Add benchmark for shrinking an array of strings

```
benchmark                    time/iter (avg)        iter/s      (min … max)           p75      p99     p995
---------------------------- ----------------------------- --------------------- --------------------------
generate a string                     5.4 µs       186,300 (  4.8 µs … 176.2 µs)   5.3 µs   6.4 µs   7.5 µs
take 10k char16                       4.4 ms         226.2 (  4.3 ms …   4.9 ms)   4.5 ms   4.7 ms   4.9 ms
uniqueArray of 5 ints                45.0 µs        22,210 ( 41.2 µs … 712.9 µs)  43.7 µs  87.2 µs 114.5 µs
uniqueArray of 6 ints                47.5 µs        21,030 ( 44.8 µs … 518.2 µs)  46.1 µs 110.2 µs 115.4 µs
uniqueArray of 100 ints             393.9 µs         2,539 (373.8 µs … 570.8 µs) 387.0 µs 507.3 µs 532.2 µs
generate 10k strings                 95.1 ms          10.5 ( 95.0 ms …  95.2 ms)  95.2 ms  95.2 ms  95.2 ms
fail to shrink a 1k string           60.5 ms          16.5 ( 60.2 ms …  61.2 ms)  60.6 ms  61.2 ms  61.2 ms
shrink an array of strings          144.4 ms           6.9 (142.7 ms … 147.1 ms) 145.5 ms 147.1 ms 147.1 ms
```

### Implement removeGroups in shrinker

Shrinking an array got a lot faster.

```
    CPU | Apple M2
Runtime | Deno 2.0.0 (aarch64-apple-darwin)

file:///Users/skybrian/Projects/deno/repeat-test/performance/benchmarks.ts

benchmark                    time/iter (avg)        iter/s      (min … max)           p75      p99     p995
---------------------------- ----------------------------- --------------------- --------------------------
generate a string                     5.4 µs       186,000 (  4.8 µs … 133.3 µs)   5.3 µs   6.2 µs   7.1 µs
take 10k char16                       4.5 ms         224.1 (  4.4 ms …   5.0 ms)   4.5 ms   4.7 ms   5.0 ms
uniqueArray of 5 ints                45.1 µs        22,150 ( 41.5 µs … 820.5 µs)  43.7 µs  95.7 µs 122.4 µs
uniqueArray of 6 ints                47.9 µs        20,890 ( 44.9 µs … 556.9 µs)  46.2 µs 110.5 µs 116.8 µs
uniqueArray of 100 ints             396.9 µs         2,519 (377.2 µs … 565.9 µs) 385.8 µs 512.3 µs 531.5 µs
generate 10k strings                 95.5 ms          10.5 ( 94.9 ms …  95.7 ms)  95.6 ms  95.7 ms  95.7 ms
fail to shrink a 1k string           60.4 ms          16.6 ( 60.2 ms …  60.8 ms)  60.4 ms  60.8 ms  60.8 ms
shrink an array of strings           35.5 ms          28.2 ( 32.0 ms …  41.1 ms)  38.5 ms  41.1 ms  41.1 ms
```

### Turn on splitting for arrays

Shrinking an array of strings regressed a bit.

```
    CPU | Apple M2
Runtime | Deno 2.0.0 (aarch64-apple-darwin)

file:///Users/skybrian/Projects/deno/repeat-test/performance/benchmarks.ts

benchmark                    time/iter (avg)        iter/s      (min … max)           p75      p99     p995
---------------------------- ----------------------------- --------------------- --------------------------
generate a string                     5.3 µs       189,000 (  4.7 µs … 291.8 µs)   5.2 µs   6.1 µs   6.6 µs
take 10k char16                       4.5 ms         222.1 (  4.4 ms …   5.1 ms)   4.6 ms   4.9 ms   5.1 ms
uniqueArray of 5 ints                44.5 µs        22,490 ( 40.7 µs … 997.6 µs)  42.9 µs 107.0 µs 117.2 µs
uniqueArray of 6 ints                47.8 µs        20,910 ( 44.2 µs … 545.8 µs)  46.5 µs 118.5 µs 124.5 µs
uniqueArray of 100 ints             389.3 µs         2,569 (369.8 µs … 566.8 µs) 379.0 µs 504.6 µs 533.0 µs
generate 10k strings                 93.2 ms          10.7 ( 93.1 ms …  93.4 ms)  93.3 ms  93.4 ms  93.4 ms
fail to shrink a 1k string           61.9 ms          16.1 ( 61.5 ms …  63.1 ms)  62.0 ms  63.1 ms  63.1 ms
shrink an array of strings           48.4 ms          20.7 ( 46.3 ms …  50.7 ms)  49.3 ms  50.7 ms  50.7 ms
```

### Use a shallow build when regenerating a cached value

Shrinking an array of strings got a lot faster.

```
    CPU | Apple M2
Runtime | Deno 2.0.0 (aarch64-apple-darwin)

file:///Users/skybrian/Projects/deno/repeat-test/performance/benchmarks.ts

benchmark                    time/iter (avg)        iter/s      (min … max)           p75      p99     p995
---------------------------- ----------------------------- --------------------- --------------------------
generate a string                     5.3 µs       186,900 (  4.8 µs … 139.9 µs)   5.3 µs   6.2 µs   6.9 µs
take 10k char16                       4.5 ms         221.5 (  4.4 ms …   5.1 ms)   4.5 ms   4.8 ms   5.1 ms
uniqueArray of 5 ints                45.5 µs        21,990 ( 41.5 µs … 839.7 µs)  44.0 µs 107.0 µs 117.0 µs
uniqueArray of 6 ints                48.2 µs        20,730 ( 45.4 µs … 583.0 µs)  46.6 µs 111.7 µs 117.2 µs
uniqueArray of 100 ints             406.0 µs         2,463 (386.1 µs … 686.1 µs) 394.4 µs 549.6 µs 562.1 µs
generate 10k strings                 94.7 ms          10.6 ( 93.8 ms …  95.8 ms)  95.0 ms  95.8 ms  95.8 ms
fail to shrink a 1k string           62.0 ms          16.1 ( 61.9 ms …  62.1 ms)  62.0 ms  62.1 ms  62.1 ms
shrink an array of strings            9.1 ms         109.6 (  8.5 ms …   9.9 ms)   9.7 ms   9.9 ms   9.9 ms
```

### After enabling splitting and caching for top-level strings

Some things got worse.

```
    CPU | Apple M2
Runtime | Deno 2.0.1 (aarch64-apple-darwin)

file:///Users/skybrian/Projects/deno/repeat-test/performance/benchmarks.ts

benchmark                    time/iter (avg)        iter/s      (min … max)           p75      p99     p995
---------------------------- ----------------------------- --------------------- --------------------------
generate a string                     9.7 µs       103,400 (  8.8 µs … 140.2 µs)   9.5 µs  11.4 µs  14.2 µs
take 10k char16                       4.4 ms         227.3 (  4.3 ms …   4.9 ms)   4.4 ms   4.6 ms   4.9 ms
uniqueArray of 5 ints                65.7 µs        15,230 ( 54.8 µs …   1.7 ms)  62.2 µs 283.3 µs 338.8 µs
uniqueArray of 6 ints                69.8 µs        14,320 ( 60.1 µs …   1.2 ms)  64.8 µs 295.4 µs 322.5 µs
uniqueArray of 100 ints             680.4 µs         1,470 (585.8 µs …   3.2 ms) 663.6 µs   1.2 ms   2.0 ms
generate 10k strings                142.8 ms           7.0 (137.1 ms … 144.3 ms) 144.0 ms 144.3 ms 144.3 ms
fail to shrink a 1k string          100.1 ms          10.0 ( 98.9 ms … 110.9 ms)  99.7 ms 110.9 ms 110.9 ms
shrink an array of strings           13.0 ms          76.8 ( 11.5 ms …  15.1 ms)  13.4 ms  15.1 ms  15.1 ms
```

### After reusing PickView and CallBuffer

Fail to shrink benchmark is back to how it was.

```
    CPU | Apple M2
Runtime | Deno 2.0.1 (aarch64-apple-darwin)

file:///Users/skybrian/Projects/deno/repeat-test/performance/benchmarks.ts

benchmark                    time/iter (avg)        iter/s      (min … max)           p75      p99     p995
---------------------------- ----------------------------- --------------------- --------------------------
generate a string                     9.6 µs       104,400 (  8.6 µs … 187.1 µs)   9.2 µs  12.8 µs  15.6 µs
take 10k char16                       4.7 ms         213.5 (  4.5 ms …   5.2 ms)   4.7 ms   4.9 ms   5.2 ms
uniqueArray of 5 ints                65.6 µs        15,250 ( 57.1 µs …   1.5 ms)  61.7 µs 271.9 µs 303.3 µs
uniqueArray of 6 ints                68.5 µs        14,590 ( 62.3 µs …   1.3 ms)  64.5 µs 279.5 µs 303.0 µs
uniqueArray of 100 ints             671.3 µs         1,490 (604.5 µs …   3.1 ms) 629.3 µs 992.4 µs   1.9 ms
generate 10k strings                137.3 ms           7.3 (132.0 ms … 142.2 ms) 139.4 ms 142.2 ms 142.2 ms
fail to shrink a 1k string           56.8 ms          17.6 ( 56.5 ms …  57.5 ms)  56.8 ms  57.5 ms  57.5 ms
shrink an array of strings           12.7 ms          78.6 ( 12.2 ms …  14.0 ms)  12.6 ms  14.0 ms  14.0 ms
```

### After reusing arrays in CallBuffer

Fail to shrink benchmark is a bit faster.

```
    CPU | Apple M2
Runtime | Deno 2.0.1 (aarch64-apple-darwin)

file:///Users/skybrian/Projects/deno/repeat-test/performance/benchmarks.ts

benchmark                    time/iter (avg)        iter/s      (min … max)           p75      p99     p995
---------------------------- ----------------------------- --------------------- --------------------------
generate a string                     9.9 µs       100,600 (  9.0 µs … 146.5 µs)   9.6 µs  13.4 µs  17.9 µs
take 10k char16                       4.4 ms         227.2 (  4.3 ms …   5.6 ms)   4.5 ms   5.1 ms   5.6 ms
uniqueArray of 5 ints                63.7 µs        15,700 ( 53.6 µs …   1.7 ms)  60.7 µs 277.2 µs 348.5 µs
uniqueArray of 6 ints                65.0 µs        15,390 ( 59.2 µs …   1.3 ms)  61.2 µs 278.4 µs 298.7 µs
uniqueArray of 100 ints             675.0 µs         1,481 (577.7 µs …   3.3 ms) 649.5 µs   1.9 ms   2.5 ms
generate 10k strings                140.5 ms           7.1 (134.9 ms … 142.7 ms) 142.5 ms 142.7 ms 142.7 ms
fail to shrink a 1k string           43.8 ms          22.8 ( 43.2 ms …  45.7 ms)  43.8 ms  45.7 ms  45.7 ms
shrink an array of strings           12.3 ms          81.0 ( 10.9 ms …  14.6 ms)  12.9 ms  14.6 ms  14.6 ms
```

### After: generate Call objects lazily in generate()

Speedup for uniqueArray.

```
    CPU | Apple M2
Runtime | Deno 2.0.1 (aarch64-apple-darwin)

file:///Users/skybrian/Projects/deno/repeat-test/performance/benchmarks.ts

benchmark                    time/iter (avg)        iter/s      (min … max)           p75      p99     p995
---------------------------- ----------------------------- --------------------- --------------------------
generate a string                     9.9 µs       100,900 (  8.8 µs … 115.9 µs)   9.5 µs  14.0 µs  56.6 µs
take 10k char16                       4.4 ms         225.1 (  4.4 ms …   4.6 ms)   4.5 ms   4.6 ms   4.6 ms
uniqueArray of 5 ints                49.6 µs        20,170 ( 45.0 µs … 807.2 µs)  47.5 µs 115.0 µs 126.7 µs
uniqueArray of 6 ints                52.0 µs        19,230 ( 48.8 µs … 650.6 µs)  50.3 µs 121.9 µs 129.2 µs
uniqueArray of 100 ints             450.5 µs         2,220 (428.7 µs … 640.2 µs) 438.0 µs 579.1 µs 615.5 µs
generate 10k strings                140.1 ms           7.1 (139.8 ms … 141.4 ms) 140.0 ms 141.4 ms 141.4 ms
fail to shrink a 1k string           44.1 ms          22.7 ( 43.8 ms …  44.6 ms)  44.4 ms  44.6 ms  44.6 ms
shrink an array of strings           13.2 ms          75.8 ( 12.3 ms …  15.0 ms)  13.1 ms  15.0 ms  15.0 ms
```

### After: use string concatenation instead of join()

Speedup for strings.

```
    CPU | Apple M2
Runtime | Deno 2.0.3 (aarch64-apple-darwin)

file:///Users/skybrian/Projects/deno/repeat-test/performance/benchmarks.ts

benchmark                    time/iter (avg)        iter/s      (min … max)           p75      p99     p995
---------------------------- ----------------------------- --------------------- --------------------------
generate a string                     8.4 µs       119,200 (  7.8 µs … 410.1 µs)   8.2 µs  10.0 µs  13.5 µs
take 10k char16                       4.4 ms         227.7 (  4.3 ms …   4.9 ms)   4.4 ms   4.6 ms   4.9 ms
uniqueArray of 5 ints                48.9 µs        20,440 ( 44.5 µs … 749.4 µs)  47.0 µs 114.2 µs 126.4 µs
uniqueArray of 6 ints                51.6 µs        19,390 ( 48.6 µs … 674.6 µs)  50.0 µs 115.7 µs 120.6 µs
uniqueArray of 100 ints             446.4 µs         2,240 (423.9 µs … 663.9 µs) 435.2 µs 558.4 µs 592.0 µs
generate 10k strings                126.6 ms           7.9 (121.9 ms … 127.7 ms) 127.7 ms 127.7 ms 127.7 ms
fail to shrink a 1k string           32.8 ms          30.4 ( 32.4 ms …  33.5 ms)  33.0 ms  33.5 ms  33.5 ms
shrink an array of strings           13.3 ms          75.0 ( 12.7 ms …  15.6 ms)  13.3 ms  15.6 ms  15.6 ms
```

### After preserving cached calls in CallBuffer

Slight speedup?

```
    CPU | Apple M2
Runtime | Deno 2.0.3 (aarch64-apple-darwin)

file:///Users/skybrian/Projects/deno/repeat-test/performance/benchmarks.ts

benchmark                    time/iter (avg)        iter/s      (min … max)           p75      p99     p995
---------------------------- ----------------------------- --------------------- --------------------------
generate a string                     8.2 µs       122,500 (  7.5 µs … 410.5 µs)   8.0 µs  11.2 µs  13.8 µs
take 10k char16                       4.7 ms         214.7 (  4.3 ms …   7.1 ms)   4.7 ms   6.3 ms   7.1 ms
uniqueArray of 5 ints                50.6 µs        19,760 ( 43.2 µs … 964.7 µs)  48.8 µs 137.8 µs 180.9 µs
uniqueArray of 6 ints                53.3 µs        18,770 ( 46.4 µs …   1.1 ms)  51.5 µs 154.5 µs 177.8 µs
uniqueArray of 100 ints             436.4 µs         2,291 (400.8 µs … 829.6 µs) 438.0 µs 582.8 µs 616.9 µs
generate 10k strings                123.4 ms           8.1 (119.9 ms … 128.0 ms) 124.6 ms 128.0 ms 128.0 ms
fail to shrink a 1k string           30.5 ms          32.8 ( 30.2 ms …  30.9 ms)  30.6 ms  30.9 ms  30.9 ms
shrink an array of strings           12.3 ms          81.3 ( 11.4 ms …  14.1 ms)  13.7 ms  14.1 ms  14.1 ms
```
