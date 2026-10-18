import { inspect as nodeInspect } from "node:util";

/** Formats a value for diagnostic messages. */
export function inspect(value: unknown): string {
  return nodeInspect(value, { colors: false });
}
