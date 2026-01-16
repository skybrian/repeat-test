# Controlling Test Repetitions from the Command Line

The `QUICKREPS` environment variable provides a way to run quick smoke tests
without modifying test code.

## Usage

```bash
# Quick smoke test - run 5 reps, skip 'sometimes' validation
QUICKREPS=5 deno test --allow-env

# Normal test run (default 1000 reps)
deno test
```

## Behavior

When `QUICKREPS=N` is set:

1. Tests run N repetitions instead of the default 1000
2. `sometimes()` assertions are **not** validated (they won't fail if only
   true or only false is observed)
3. The explicit `reps` option in `repeatTest()` still takes precedence

This is useful for:
- Quick CI status checks
- Fast iteration during development
- Verifying tests aren't completely broken

## Precedence

1. **Explicit `reps` option** in `repeatTest()` call (highest priority)
2. **`QUICKREPS` environment variable**
3. **Default** of 1000 reps

## Deno Permissions

Reading environment variables requires `--allow-env`. If not granted, the
environment variable is silently ignored and defaults apply.

## Task Shortcuts

Add to `deno.jsonc` for convenience:

```jsonc
{
  "tasks": {
    "test": "deno test",
    "test:quick": "QUICKREPS=5 deno test --allow-env"
  }
}
```

## See Also

- `repeatTest()` accepts a `reps` option for per-test configuration
- `sometimes()` in TestConsole for coverage assertions
