import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertStringIncludes, assertThrows } from "@std/assert";

import {
  compareCoverage,
  type Coverage,
  formatSummary,
  parseLcov,
} from "../scripts/coverage_report.ts";

function coverage(files: Record<string, [number, number][]>): Coverage {
  return new Map(
    Object.entries(files).map(([path, lines]) => [path, new Map(lines)]),
  );
}

describe("parseLcov", () => {
  it("reads DA lines, including zero hits and optional checksums", () => {
    assertEquals(
      parseLcov(
        "TN:api\r\nSF:src/a.ts\r\nDA:4,0\r\nDA:8,3,checksum\r\nLF:2\r\nLH:1\r\nend_of_record\r\n",
        "/repo",
      ),
      coverage({ "src/a.ts": [[4, 0], [8, 3]] }),
    );
  });

  it("normalizes absolute paths, file URLs, and relative paths", () => {
    const text = [
      "SF:/repo/src/dir/../a.ts",
      "DA:1,1",
      "end_of_record",
      "SF:file:///repo/src/a%20b.ts",
      "DA:2,2",
      "end_of_record",
      "SF:./src/sub/../relative.ts",
      "DA:3,3",
    ].join("\n");
    assertEquals(
      parseLcov(text, "file:///repo/"),
      coverage({
        "src/a.ts": [[1, 1]],
        "src/a b.ts": [[2, 2]],
        "src/relative.ts": [[3, 3]],
      }),
    );
  });

  it("normalizes Windows paths without consulting the host filesystem", () => {
    assertEquals(
      parseLcov(
        "SF:C:\\repo\\src\\a.ts\nDA:1,1\nSF:file:///C:/repo/src/b.ts\nDA:2,0\n",
        "C:\\repo",
      ),
      coverage({ "src/a.ts": [[1, 1]], "src/b.ts": [[2, 0]] }),
    );
  });

  it("ignores sources outside the repository's src directory", () => {
    const ignored = [
      "/other/src/a.ts",
      "/repository/src/a.ts",
      "test/a.ts",
      "src-other/a.ts",
      "../src/a.ts",
      "src/../../outside.ts",
      "file:///repo/src/%2e%2e/test/a.ts",
      "file:///repo/src/%2e%2e%2f%2e%2e/outside.ts",
      "file://other/repo/src/a.ts",
      "https://example.com/src/a.ts",
      "file:///repo/src/a.ts?query",
      "file:///repo/src/%invalid.ts",
      "",
      "src",
    ];
    const text = ignored.map((path) => `SF:${path}\nDA:1,9\nend_of_record`)
      .join("\n");
    assertEquals(parseLcov(text, "/repo"), new Map());
  });

  it("handles a repository at the filesystem root", () => {
    assertEquals(
      parseLcov("SF:/src/a.ts\nDA:1,1", "/"),
      coverage({ "src/a.ts": [[1, 1]] }),
    );
  });

  it("adds duplicate lines and duplicate source records after normalization", () => {
    assertEquals(
      parseLcov(
        [
          "SF:src/a.ts",
          "DA:1,2",
          "DA:1,3",
          "DA:2,0",
          "end_of_record",
          "SF:file:///repo/src/a.ts",
          "DA:1,4",
          "DA:2,0",
          "DA:3,1",
        ].join("\n"),
        "/repo",
      ),
      coverage({ "src/a.ts": [[1, 9], [2, 0], [3, 1]] }),
    );
  });

  it("retains source files with no executable lines and accepts empty input", () => {
    assertEquals(parseLcov("", "/repo"), new Map());
    assertEquals(
      parseLcov("SF:src/empty.ts\nend_of_record", "/repo"),
      coverage({ "src/empty.ts": [] }),
    );
  });

  it("rejects malformed DA records rather than silently losing coverage", () => {
    for (
      const da of [
        "DA",
        "DA:",
        "DA:1",
        "DA:0,1",
        "DA:-1,2",
        "DA:1,-2",
        "DA:1,1.5",
        "DA:1.5,1",
        "DA:1,NaN",
        "DA:1,Infinity",
        "DA:1,2junk",
        "DA:1,",
        "DA:1,2,",
        "DA:1,2,checksum,extra",
        "DA:1, 2",
        "DA:9007199254740992,1",
        "DA:1,9007199254740992",
      ]
    ) {
      assertThrows(
        () => parseLcov(`SF:src/a.ts\n${da}`, "/repo"),
        Error,
        "Malformed DA record at LCOV line 2",
      );
    }
    assertThrows(
      () => parseLcov("SF:test/ignored.ts\nDA:bad", "/repo"),
      Error,
      "Malformed DA",
    );
  });

  it("rejects DA without a source record and duplicate hit count overflow", () => {
    for (
      const text of [
        "DA:1,1",
        "SF:src/a.ts\nend_of_record\nDA:1,1",
      ]
    ) {
      assertThrows(
        () => parseLcov(text, "/repo"),
        Error,
        "DA record without SF",
      );
    }
    assertThrows(
      () => parseLcov("SF:src/a.ts\nDA:1,9007199254740991\nDA:1,1", "/repo"),
      Error,
      "overflow",
    );
  });

  it("requires an absolute repository root", () => {
    for (const root of ["", ".", "repo", "https://example.com/repo"]) {
      assertThrows(() => parseLcov("", root), Error, "absolute path");
    }
  });
});

describe("compareCoverage", () => {
  it("uses the union of executable lines and counts zero hits as uncovered", () => {
    const api = coverage({ "src/a.ts": [[1, 3], [2, 0], [4, 0]] });
    const all = coverage({ "src/a.ts": [[2, 0], [3, 5], [4, 2]] });
    assertEquals(compareCoverage(api, all), [{
      path: "src/a.ts",
      lines: new Map([
        [1, "api"],
        [2, "uncovered"],
        [3, "internal"],
        [4, "internal"],
      ]),
      total: 4,
      apiCovered: 1,
      allCovered: 2,
      internalOnly: 2,
    }]);
  });

  it("treats files missing from the API suite as zero API coverage", () => {
    assertEquals(
      compareCoverage(new Map(), coverage({ "src/a.ts": [[1, 2], [2, 0]] })),
      [{
        path: "src/a.ts",
        lines: new Map([[1, "internal"], [2, "uncovered"]]),
        total: 2,
        apiCovered: 0,
        allCovered: 1,
        internalOnly: 1,
      }],
    );
  });

  it("does not invent full-suite hits when an independent API run hits a line", () => {
    const api = coverage({
      "src/a.ts": [[1, 1], [2, 1]],
      "src/only-api.ts": [[9, 4]],
    });
    const all = coverage({ "src/a.ts": [[1, 0], [2, 2]] });
    assertEquals(compareCoverage(api, all), [
      {
        path: "src/a.ts",
        lines: new Map([[1, "api"], [2, "api"]]),
        total: 2,
        apiCovered: 2,
        allCovered: 1,
        internalOnly: 0,
      },
      {
        path: "src/only-api.ts",
        lines: new Map([[9, "api"]]),
        total: 1,
        apiCovered: 1,
        allCovered: 0,
        internalOnly: 0,
      },
    ]);
  });

  it("handles empty coverage and empty files", () => {
    assertEquals(compareCoverage(new Map(), new Map()), []);
    assertEquals(compareCoverage(coverage({ "src/empty.ts": [] }), new Map()), [
      {
        path: "src/empty.ts",
        lines: new Map(),
        total: 0,
        apiCovered: 0,
        allCovered: 0,
        internalOnly: 0,
      },
    ]);
  });

  it("sorts files and lines deterministically without mutating either suite", () => {
    const api = coverage({ "src/z.ts": [[9, 1], [1, 0]] });
    const all = coverage({ "src/a.ts": [[2, 1]], "src/z.ts": [[3, 2]] });
    const apiBefore = structuredClone(api);
    const allBefore = structuredClone(all);
    const files = compareCoverage(api, all);
    assertEquals(files.map((file) => file.path), ["src/a.ts", "src/z.ts"]);
    assertEquals([...files[1].lines.keys()], [1, 3, 9]);
    assertEquals(api, apiBefore);
    assertEquals(all, allBefore);
  });
});

describe("formatSummary", () => {
  it("weights totals by executable lines, not by file percentages", () => {
    const files = compareCoverage(
      coverage({ "src/small.ts": [[1, 1]] }),
      coverage({
        "src/small.ts": [[1, 1]],
        "src/large.ts": Array.from({ length: 99 }, (_, i) => [i + 1, 1]),
      }),
    );
    const summary = formatSummary(files);
    assertStringIncludes(
      summary,
      "| TOTAL | 1/100 (1.00%) | 100/100 (100.00%) | 99.00 | 99 |",
    );
    assertStringIncludes(summary, "union of both suites");
    assertStringIncludes(summary, "internal = full-suite hit only");
    assertStringIncludes(summary, "uncovered = neither");
    assertStringIncludes(summary, "API-only hit is not counted as full-suite");
  });

  it("sorts by percentage-point gap, breaks ties by path, and preserves input", () => {
    const files = compareCoverage(
      coverage({
        "src/a.ts": [[1, 1], [2, 0]],
        "src/z.ts": [[1, 0]],
        "src/negative.ts": [[1, 1]],
        "src/m.ts": [[1, 0]],
      }),
      coverage({
        "src/a.ts": [[1, 1], [2, 1]],
        "src/z.ts": [[1, 1], [2, 0]],
        "src/negative.ts": [[1, 0]],
        "src/m.ts": [[1, 1]],
      }),
    ).reverse();
    const before = structuredClone(files);
    const summary = formatSummary(files);
    assertEquals(
      summary.split("\n").filter((line) => line.startsWith("| src/"))
        .map((line) => line.split(" | ")[0]),
      ["| src/m.ts", "| src/a.ts", "| src/z.ts", "| src/negative.ts"],
    );
    assertStringIncludes(
      summary,
      "| src/negative.ts | 1/1 (100.00%) | 0/1 (0.00%) | -100.00 | 0 |",
    );
    assertEquals(files, before);
  });

  it("formats zero-line coverage without NaN or Infinity", () => {
    const empty = formatSummary([]);
    assertStringIncludes(
      empty,
      "| TOTAL | 0/0 (0.00%) | 0/0 (0.00%) | 0.00 | 0 |",
    );
    const files = compareCoverage(coverage({ "src/empty.ts": [] }), new Map());
    assertStringIncludes(
      formatSummary(files),
      "| src/empty.ts | 0/0 (0.00%) | 0/0 (0.00%) | 0.00 | 0 |",
    );
  });
});
