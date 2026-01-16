#!/bin/bash
# Check if working directory is clean; if not, run checks

set -e

# Check for uncommitted changes
if git diff --quiet && git diff --cached --quiet; then
    echo "Working directory is clean."
    exit 0
fi

echo "Changes detected. Running checks..."
echo

echo "=== Type checking ==="
deno check src/**/*.ts test/**/*.ts

echo
echo "=== Linting ==="
deno lint --ignore=examples/

echo
echo "=== Quick tests ==="
QUICKREPS=5 deno test --allow-env

echo
echo "All checks passed!"
