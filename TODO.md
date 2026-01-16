# TODO

Items to consider for future releases.

## Naming

- Consider renaming `Script` class and `src/scripts/` directory. The name is confusing since it has nothing to do with actual scripts - it's a wrapper around a build function with metadata (name, weight, maxSize, etc.). Possible alternatives: `Builder`, `Generator`, `Recipe`, `Blueprint`.
