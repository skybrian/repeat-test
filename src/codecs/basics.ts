import * as arb from "../arbitraries.ts";
import Codec from "../codec_class.ts";

export function int(min: number, max: number): Codec<number> {
  const domain = arb.int(min, max);
  if (min >= 0) {
    return new Codec(domain, (val) => [val]);
  } else if (max <= 0) {
    return new Codec(domain, (val) => [-val]);
  } else {
    return new Codec(domain, (val) => [val < 0 ? 1 : 0, Math.abs(val)]);
  }
}
