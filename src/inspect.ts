/** Formats a value for diagnostic messages. */
export function inspect(value: unknown): string {
  return Deno.inspect(value);
}
