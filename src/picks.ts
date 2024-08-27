/**
 * A source of random signed 32-bit integers.
 */
export type RandomSource = () => number;

/**
 * Returns a random number such that 0 <= n <= max.
 * Where max < 2**32.
 */
function smallUniformPick(next: RandomSource, max: number) {
  if (max === 1) {
    return next() & 1;
  }
  const size = max + 1;
  const quotient = ~~(0x100000000 / size); // does not work for size === 2
  const limit = quotient * size;
  while (true) {
    const val = next() + 0x80000000;
    if (val < limit) {
      return val % size;
    }
  }
}

/**
 * Returns a random number such that 0 <= n <= max.
 * Where max >= 2**32 and max <= Math.MAX_SAFE_INTEGER.
 */
function largeUniformPick(next: RandomSource, max: number) {
  const hiMax = (max / 0x100000000) | 0;
  const loMax = max - hiMax * 0x100000000;
  while (true) {
    const hi = smallUniformPick(next, hiMax);
    const lo = next() + 0x80000000;
    if (hi < hiMax || lo <= loMax) {
      return hi * 0x100000000 + lo;
    }
  }
}

/**
 * Picks an integer, given a source of random numbers.
 *
 * The range is unspecified (given by context).
 */
export type RandomPicker = (source: RandomSource) => number;

/**
 * Given a range, returns a function that picks an integer in that range using a uniform distribution.
 *
 * min <= pick <= max.
 *
 * min and max are non-negative safe integers.
 */
function uniformPicker(min: number, max: number): RandomPicker {
  const innerMax = max - min;
  switch (innerMax) {
    case 0:
      return () => min;
    case 1:
      return (source) => (source() & 1) + min;
    case 127:
      return (source) => (source() & 0x7F) + min;
  }
  if (innerMax < 0x100000000) {
    return (source) => smallUniformPick(source, innerMax) + min;
  } else {
    return (source) => largeUniformPick(source, innerMax) + min;
  }
}

/** Options on a {@link PickRequest}. */
export type PickRequestOpts = {
  /**
   * Overrides the random distribution for this request. The output should be in
   * range for the request.
   */
  bias?: RandomPicker;
};

/**
 * Requests a safe, non-negative integer in a given range.
 *
 * The reply may be any number within range, chosen either deterministically or
 * randomly.
 *
 * When picking randomly, the {@link random} function implements the requested
 * probability distribution.
 */
export class PickRequest {
  /**
   * The function to call when picking randomly.
   *
   * The output is assumed to satisfy {@link PickRequest.inRange}.
   */
  readonly random: RandomPicker;

  /**
   * Constructs a request an integer in a given range.
   *
   * The range must be over non-negative integers and have at at least one
   * choice: min <= max.
   *
   * If no bias is provided, {@link random} implements a uniform distribution.
   */
  constructor(
    readonly min: number,
    readonly max: number,
    opts?: PickRequestOpts,
  ) {
    if (min < 0) {
      throw new Error(`min must be non-negative; got ${min}`);
    }
    if (!Number.isSafeInteger(min)) {
      throw new Error(`min must be a safe integer; got ${min}`);
    }
    if (!Number.isSafeInteger(max)) {
      throw new Error(`max must be a safe integer; got ${max}`);
    }
    if (min > max) {
      throw new Error(`invalid range: ${min}..${max}`);
    }
    this.random = opts?.bias ?? uniformPicker(min, max);
  }

  /** Returns true if the given number satisfies this request. */
  inRange(n: number): boolean {
    return Number.isSafeInteger(n) && n >= this.min && n <= this.max;
  }

  /** Describes the request's range, for debugging. */
  toString(): string {
    return `${this.min}..${this.max}`;
  }
}

/**
 * Creates a PickRequest where {@link PickRequest.random} chooses 0 or 1
 * with the given probability.
 *
 * @param probOne The probability of picking 1.
 */
export function biasedBitRequest(probOne: number): PickRequest {
  // There are 2**32 bins and (2**32 + 1) places to put a partition.
  const threshold = Math.floor((1 - probOne) * 0x100000001) - 0x80000000;
  const bias = (next: RandomSource) => {
    return next() < threshold ? 0 : 1;
  };
  return new PickRequest(0, 1, { bias });
}

/**
 * A state machine that picks an integer, given a request.
 * (Like an iterator, this is mutable.)
 */
export interface IntPicker {
  /**
   * Transitions to a new state and returns a pick satisfying
   * {@link PickRequest.inRange}.
   */
  pick(req: PickRequest): number;
}

export const alwaysPickMin: IntPicker = {
  pick: (req) => req.min,
};

/**
 * Returns a single-state picker that always picks the same number.
 *
 * It will throw an exception if it can't satisfy a request.
 */
export function alwaysPick(n: number) {
  const picker: IntPicker = {
    pick: (req) => {
      if (!req.inRange(n)) {
        throw new Error(
          `can't satisfy request (${req.min}, ${req.max}) with ${n}`,
        );
      }
      return n;
    },
  };
  return picker;
}

export class PickList {
  readonly ok = true; // Can be used as a success response.
  readonly #reqs: PickRequest[];
  readonly #replies: number[];

  private constructor(reqs: PickRequest[], replies: number[]) {
    this.#reqs = reqs;
    this.#replies = replies;
  }

  get length(): number {
    return this.#reqs.length;
  }

  reqs(): PickRequest[] {
    return this.#reqs.slice();
  }

  replies(): number[] {
    return this.#replies.slice();
  }

  isBit(i: number, expected?: number): boolean {
    const req = this.#reqs[i];
    if (req.min !== 0 || req.max !== 1) {
      return false;
    }
    if (expected !== undefined) {
      return expected === this.#replies[i];
    }
    return true;
  }

  splice(start: number, deleteCount: number) {
    this.#reqs.splice(start, deleteCount);
    this.#replies.splice(start, deleteCount);
  }

  /** Returns a copy without trailing picks that are the same as the request's minimum value. */
  trimmed(): PickList {
    let last = this.#reqs.length - 1;
    while (last >= 0 && this.#replies[last] === this.#reqs[last].min) {
      last--;
    }
    return PickList.zip(
      this.#reqs.slice(0, last + 1),
      this.#replies.slice(0, last + 1),
    );
  }

  static zip(reqs: PickRequest[], replies: number[]): PickList {
    if (reqs.length !== replies.length) {
      throw new Error("reqs and replies must be the same length");
    }
    return new PickList(reqs, replies);
  }

  /**
   * Constructs a pick list with no alternative choices.
   *
   * Each request's range only includes the reply.
   */
  static fromReplies(replies: number[]): PickList {
    return PickList.zip(replies.map((r) => new PickRequest(r, r)), replies);
  }
}

/**
 * A picker that provides a single playout and checks for mismatches.
 */
export class PlaybackPicker implements IntPicker {
  private depth = 0;
  private rangeError?: string = undefined;

  constructor(private readonly expected: number[]) {
    for (let i = 0; i < expected.length; i++) {
      const pick = expected[i];
      if (!Number.isSafeInteger(expected[i])) {
        throw new Error(`${i}: expected a safe integer, got: ${pick}`);
      } else if (pick < 0) {
        throw new Error(`${i}: expected a non-negative integer, got: ${pick}`);
      }
    }
  }

  pick(req: PickRequest): number {
    if (this.depth >= this.expected.length) {
      this.depth++;
      return req.min;
    }
    let pick = this.expected[this.depth];
    if (!req.inRange(pick)) {
      if (this.rangeError === undefined) {
        this.rangeError = `pick ${this.depth} didn't satisfy the request.` +
          ` Want: [${req.min}, ${req.max}]. Got: ${pick}`;
      }
      pick = req.min;
    }
    this.depth++;
    return pick;
  }

  get error(): string | undefined {
    if (this.rangeError) return this.rangeError;
    if (this.depth > this.expected.length) {
      return "ran out of picks";
    }
    if (this.depth !== this.expected.length) {
      return `read only ${this.depth} of ${this.expected.length} available picks`;
    }
    return undefined;
  }
}
