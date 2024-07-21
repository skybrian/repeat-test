export const surrogateMin = 0xd800;
export const surrogateMax = 0xdfff;
export const surrogateGap = surrogateMax - surrogateMin + 1;
export const unicodeMax = 0x10ffff;

export function isSurrogate(code: number): boolean {
  return code >= surrogateMin && code <= surrogateMax;
}
