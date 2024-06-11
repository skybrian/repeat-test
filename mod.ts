/**
 * An infinite stream of numbers that's based on a byte array.
 * When the end of the input has been reached, the stream will continue to return zero.
 *
 * Bytes are read from the stream in little-endian order.
 */
export class NumberStream {
  offset: number = 0;

  constructor(private bytes: Uint8Array) {}

  /**
   * Returns a non-negative integer from the stream that's less than the given limit.
   * If the end of the input has been reached, returns zero.
   *
   * @param limit must be between 2 and 2**53.
   */
  unsignedInt(limit: number): number {
    if (limit < 2 || limit > 2 ** 53) {
      throw new Error(`limit must be between 2 and 2**53, got ${limit}`);
    }
    if (!Number.isSafeInteger(limit - 1)) {
      throw new Error(`limit includes unsafe integers, got ${limit}`);
    }
    const bitsNeeded = Math.ceil(Math.log2(limit));
    const bytesNeeded = Math.ceil(bitsNeeded / 8);

    let n: number = 0;
    // loop over all but the last byte
    for (let i = 0; i < bytesNeeded - 1; i++) {
      const byte = this.bytes[this.offset + i];
      if (byte === undefined) {
        this.offset += i;
        return n;
      }
      n += byte * (2 ** (8 * i));
    }

    const lastByte = this.bytes[this.offset + bytesNeeded - 1];
    if (lastByte === undefined) {
      this.offset += bytesNeeded;
      return n;
    }

    // we might not need all the bits in the last byte.
    const remainingBits = bitsNeeded - 8 * (bytesNeeded - 1);
    const lastByteMask = (1 << remainingBits) - 1;
    n = n + (lastByte & lastByteMask) * (2 ** (8 * (bytesNeeded - 1)));

    this.offset += bytesNeeded;
    // the limit might not be a power of two.
    return (n >= limit) ? n - limit : n;
  }
}

export interface Arbitrary<T> {
  sample(): T;
}
