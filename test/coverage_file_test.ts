import { assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { formatFileCoverage } from "../scripts/coverage_file.ts";
import { compareCoverage, parseLcov } from "../scripts/coverage_report.ts";

function file(apiLines: string, allLines: string) {
  const report = (lines: string) =>
    parseLcov(
      `SF:src/example.ts\n${lines}\nend_of_record\n`,
      "/repo",
    );
  return compareCoverage(report(apiLines), report(allLines))[0];
}

describe("formatFileCoverage", () => {
  it("marks API, internal-only, uncovered, and unmeasured lines", () => {
    const output = formatFileCoverage(
      file("DA:1,1\nDA:2,0\nDA:3,0", "DA:1,1\nDA:2,1\nDA:3,0"),
      "api();\ninternal();\nmissing();\n// comment\n",
    );
    assertStringIncludes(output, "A 1 | api();");
    assertStringIncludes(output, "I 2 | internal();");
    assertStringIncludes(output, "U 3 | missing();");
    assertStringIncludes(output, "- 4 | // comment");
    assertStringIncludes(output, "API: 1/3 (33.3%) | All: 2/3 (66.7%)");
  });

  it("merges nearby context and omits distant API-covered source", () => {
    const lines = Array.from({ length: 15 }, (_, i) => `line ${i + 1};`);
    const output = formatFileCoverage(
      file("DA:1,1\nDA:5,0\nDA:6,0\nDA:14,0", "DA:5,1"),
      lines.join("\n"),
    );
    assertStringIncludes(output, "  …\n-  3 | line 3;");
    assertStringIncludes(output, "I  5 | line 5;");
    assertStringIncludes(output, "U  6 | line 6;");
    assertStringIncludes(output, "  …\n- 12 | line 12;");
    assertEquals(output.includes("| line 1;"), false);
    assertEquals(output.match(/\| line 5;/g)?.length, 1);
  });

  it("shows a message for API-covered files, or all source with --all", () => {
    const coverage = file("DA:1,1", "DA:1,1");
    assertStringIncludes(
      formatFileCoverage(coverage, "api();\n// end\n"),
      "All measured executable lines are API-covered.",
    );
    const all = formatFileCoverage(coverage, "api();\r\n// end\r\n", true);
    assertStringIncludes(all, "A 1 | api();\n- 2 | // end");
    assertEquals(all.includes("\r"), false);
    assertEquals(all.includes("3 |"), false);
  });

  it("handles empty source and no measured lines without dividing by zero", () => {
    assertStringIncludes(
      formatFileCoverage(file("", ""), ""),
      "API: 0/0 (n/a)",
    );
  });

  it("rejects line numbers beyond the source", () => {
    assertThrows(
      () => formatFileCoverage(file("DA:5,0", ""), "one line"),
      Error,
      "Refresh reports",
    );
  });
});
