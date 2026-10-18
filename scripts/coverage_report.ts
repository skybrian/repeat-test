import { posix } from "node:path";

/** Executable line numbers and their hit counts. */
export type LineCoverage = Map<number, number>;

/** Repository-relative source paths and their executable lines. */
export type Coverage = Map<string, LineCoverage>;

export type CoverageStatus = "api" | "internal" | "uncovered";

export interface FileCoverage {
  path: string;
  lines: Map<number, CoverageStatus>;
  total: number;
  apiCovered: number;
  allCovered: number;
  internalOnly: number;
}

function normalizePath(value: string): string | undefined {
  if (value.startsWith("file:")) {
    try {
      const url = new URL(value);
      if (
        url.protocol !== "file:" || url.search || url.hash ||
        (url.hostname !== "" && url.hostname !== "localhost")
      ) return undefined;
      value = decodeURIComponent(url.pathname);
      // File URLs use /C:/... for Windows drive paths.
      if (/^\/[a-z]:\//i.test(value)) value = value.slice(1);
    } catch {
      return undefined;
    }
  } else if (
    /^[a-z][a-z\d+.-]*:/i.test(value) && !/^[a-z]:[/\\]/i.test(value)
  ) {
    return undefined;
  }
  if (!value || value.includes("\0")) return undefined;
  value = value.replaceAll("\\", "/");
  value = value.replace(/^[A-Z]:/, (drive) => drive.toLowerCase());
  return posix.normalize(value);
}

function isAbsolute(path: string): boolean {
  return path.startsWith("/") || /^[a-z]:\//i.test(path);
}

/**
 * Parses LCOV without reading files. The root must be an absolute repository
 * directory (or a file URL). Only normalized paths inside its src/ survive.
 *
 * Duplicate DA records, including records in repeated SF sections, add their
 * hit counts. Malformed DA records throw, even for ignored source files.
 */
export function parseLcov(text: string, root: string): Coverage {
  const normalizedRoot = normalizePath(root);
  if (!normalizedRoot || !isAbsolute(normalizedRoot)) {
    throw new Error("Repository root must be an absolute path or file URL");
  }
  const prefix = normalizedRoot.endsWith("/")
    ? normalizedRoot
    : normalizedRoot + "/";
  const files: Coverage = new Map();
  let source: LineCoverage | undefined;
  let hasSource = false;

  for (const [index, raw] of text.split("\n").entries()) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (line.startsWith("SF:")) {
      hasSource = true;
      source = undefined;
      const path = normalizePath(line.slice(3));
      if (!path) continue;
      const absolute = isAbsolute(path) ? path : posix.normalize(prefix + path);
      if (!absolute.startsWith(prefix)) continue;
      const relative = absolute.slice(prefix.length);
      if (!relative.startsWith("src/")) continue;
      source = files.get(relative);
      if (!source) {
        source = new Map();
        files.set(relative, source);
      }
    } else if (line === "end_of_record") {
      hasSource = false;
      source = undefined;
    } else if (line === "DA" || line.startsWith("DA:")) {
      const match = /^DA:([1-9]\d*),(\d+)(?:,[^,]+)?$/.exec(line);
      const number = Number(match?.[1]);
      const hits = Number(match?.[2]);
      if (
        !match || !Number.isSafeInteger(number) ||
        !Number.isSafeInteger(hits)
      ) {
        throw new Error(
          `Malformed DA record at LCOV line ${index + 1}: ${line}`,
        );
      }
      if (!hasSource) {
        throw new Error(`DA record without SF at LCOV line ${index + 1}`);
      }
      if (source) {
        const combined = (source.get(number) ?? 0) + hits;
        if (!Number.isSafeInteger(combined)) {
          throw new Error(`DA hit count overflow at LCOV line ${index + 1}`);
        }
        source.set(number, combined);
      }
    }
  }
  return files;
}

/** Compares independent suites using the union of their executable lines. */
export function compareCoverage(api: Coverage, all: Coverage): FileCoverage[] {
  const paths = new Set([...api.keys(), ...all.keys()]);
  return [...paths].sort().map((path) => {
    const apiLines = api.get(path);
    const allLines = all.get(path);
    const numbers = new Set([
      ...(apiLines?.keys() ?? []),
      ...(allLines?.keys() ?? []),
    ]);
    const file: FileCoverage = {
      path,
      lines: new Map(),
      total: numbers.size,
      apiCovered: 0,
      allCovered: 0,
      internalOnly: 0,
    };
    for (const number of [...numbers].sort((a, b) => a - b)) {
      const apiHit = (apiLines?.get(number) ?? 0) > 0;
      const allHit = (allLines?.get(number) ?? 0) > 0;
      if (apiHit) file.apiCovered++;
      if (allHit) file.allCovered++;
      if (!apiHit && allHit) file.internalOnly++;
      file.lines.set(
        number,
        apiHit ? "api" : allHit ? "internal" : "uncovered",
      );
    }
    return file;
  });
}

function fraction(covered: number, total: number): number {
  return total === 0 ? 0 : covered / total;
}

function gap(file: FileCoverage): number {
  return fraction(file.allCovered - file.apiCovered, file.total);
}

/** Formats a weighted summary, largest full-minus-API percentage-point gap first. */
export function formatSummary(files: readonly FileCoverage[]): string {
  const sorted = [...files].sort((a, b) =>
    gap(b) - gap(a) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  );
  const total: FileCoverage = {
    path: "TOTAL",
    lines: new Map(),
    total: 0,
    apiCovered: 0,
    allCovered: 0,
    internalOnly: 0,
  };
  function row(file: FileCoverage): string {
    const coverage = (hits: number) =>
      `${hits}/${file.total} (${
        (fraction(hits, file.total) * 100).toFixed(2)
      }%)`;
    return `| ${file.path} | ${coverage(file.apiCovered)} | ${
      coverage(file.allCovered)
    } | ${(gap(file) * 100).toFixed(2)} | ${file.internalOnly} |`;
  }
  for (const file of files) {
    total.total += file.total;
    total.apiCovered += file.apiCovered;
    total.allCovered += file.allCovered;
    total.internalOnly += file.internalOnly;
  }
  return [
    "| File | API coverage | Full-suite coverage | Gap (pp) | Internal-only lines |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...sorted.map(row),
    row(total),
    "",
    "Executable lines: union of both suites; missing API records count as zero.",
    "Gap: full-suite % minus API %; totals are weighted by executable lines.",
    "Legend: api = API hit; internal = full-suite hit only; uncovered = neither.",
    "Suites are independent: an API-only hit is not counted as full-suite coverage.",
  ].join("\n");
}
