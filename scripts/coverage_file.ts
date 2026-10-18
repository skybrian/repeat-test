/** Annotated source rendering, independent of filesystem and terminal APIs. */
import type { FileCoverage } from "./coverage_report.ts";

export function formatFileCoverage(
  file: FileCoverage,
  source: string,
  showAll = false,
): string {
  const sourceLines = source === ""
    ? []
    : source.replace(/\r?\n$/, "").split(/\r?\n/);
  for (const line of file.lines.keys()) {
    if (line > sourceLines.length) {
      throw new Error(
        "Coverage line numbers exceed the source. Refresh reports.",
      );
    }
  }
  const gaps = [...file.lines].filter(([, status]) => status !== "api");
  const percent = (n: number) =>
    file.total ? `${(100 * n / file.total).toFixed(1)}%` : "n/a";
  const output = [
    file.path,
    `API: ${file.apiCovered}/${file.total} (${percent(file.apiCovered)}) | ` +
    `All: ${file.allCovered}/${file.total} (${percent(file.allCovered)}) | ` +
    `Internal-only: ${file.internalOnly}`,
    "",
    "A = API-covered; I = full-suite only; U = uncovered by either; - = not measured",
    "",
  ];
  if (!gaps.length && !showAll) {
    output.push(
      file.total
        ? "All measured executable lines are API-covered. Use --all to show source."
        : "No measured executable lines.",
    );
    return output.join("\n");
  }
  const visible = new Set<number>();
  if (showAll) {
    for (let line = 1; line <= sourceLines.length; line++) visible.add(line);
  } else {
    for (const [line] of gaps) {
      for (
        let nearby = Math.max(1, line - 2);
        nearby <= Math.min(sourceLines.length, line + 2);
        nearby++
      ) visible.add(nearby);
    }
  }
  const width = String(sourceLines.length).length;
  const markers = { api: "A", internal: "I", uncovered: "U" };
  let previous = 0;
  for (const line of [...visible].sort((a, b) => a - b)) {
    if (line > previous + 1) output.push("  …");
    const status = file.lines.get(line);
    const marker = status === undefined ? "-" : markers[status];
    output.push(
      `${marker} ${String(line).padStart(width)} | ${sourceLines[line - 1]}`,
    );
    previous = line;
  }
  if (previous < sourceLines.length) output.push("  …");
  return output.join("\n");
}
