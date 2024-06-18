interface ExtraStringMethods {
  isWellFormed(): boolean;
}

// Workaround for https://github.com/denoland/deno/issues/24238
export function isWellFormed(str: string): boolean {
  return (str as unknown as ExtraStringMethods).isWellFormed();
}
