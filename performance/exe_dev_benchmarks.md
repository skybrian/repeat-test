# Benchmark Results (exe.dev VM)

Machine: Intel Xeon Platinum 8259CL @ 2.50GHz (x86_64-unknown-linux-gnu)

## Version 0.5.0

Deno 2.6.5

```
| benchmark                             | time/iter (avg) |        iter/s |      (min … max)      |      p75 |      p99 |     p995 |
| ------------------------------------- | --------------- | ------------- | --------------------- | -------- | -------- | -------- |
| generate a string                     |         25.6 µs |        39,010 |  (17.9 µs …   8.5 ms) |  21.1 µs | 121.3 µs | 189.1 µs |
| take 10k char16                       |         13.1 ms |          76.1 |  (10.7 ms …  34.0 ms) |  11.9 ms |  34.0 ms |  34.0 ms |
| uniqueArray of 5 ints                 |        242.9 µs |         4,117 | (187.1 µs …   5.6 ms) | 250.5 µs | 561.5 µs | 619.9 µs |
| uniqueArray of 6 ints                 |        245.9 µs |         4,067 | (205.0 µs … 780.7 µs) | 234.8 µs | 451.7 µs | 479.9 µs |
| uniqueArray of 100 ints               |          2.2 ms |         447.2 |   (2.0 ms …   5.0 ms) |   2.3 ms |   4.5 ms |   4.9 ms |
| generate 10k strings                  |        371.5 ms |           2.7 | (362.8 ms … 410.7 ms) | 368.3 ms | 410.7 ms | 410.7 ms |
| fail to shrink a 1k string            |         94.1 ms |          10.6 |  (74.6 ms … 231.9 ms) |  84.4 ms | 231.9 ms | 231.9 ms |
| fail to shrink var length 1k string   |        131.7 ms |           7.6 | (127.3 ms … 143.1 ms) | 134.4 ms | 143.1 ms | 143.1 ms |
| shrink an array of strings            |         30.1 ms |          33.3 |  (27.1 ms …  47.3 ms) |  29.5 ms |  47.3 ms |  47.3 ms |
```
