/**
 * Randomly picks an integer from a uniform distribution.
 *
 * Precondition: min and max are safe integers.
 * Postcondition: see {@link inRange}.
 */
export type UniformIntPicker = (min: number, max: number) => number;

function inRange(n: number, min: number, max: number) {
  return Number.isSafeInteger(n) && n >= min && n <= max;
}

/**
 * Picks an integer from a random distribution.
 *
 * The range is unspecified (given by context).
 *
 * @param uniform A source of random numbers.
 */
export type BiasedIntPicker = (uniform: UniformIntPicker) => number;

export function uniformBias(min: number, max: number): BiasedIntPicker {
  return (uniform: UniformIntPicker) => uniform(min, max);
}

const biasBins = 0x100000000;

/**
 * Returns a bias function that chooses between 0 and 1.
 *
 * @param probOne The probability of picking 1.
 */
export function biasedBit(probOne: number): BiasedIntPicker {
  return (uniform: UniformIntPicker) => {
    const threshold = Math.floor((1 - probOne) * biasBins);
    const choice = uniform(1, biasBins);
    return choice <= threshold ? 0 : 1;
  };
}

export type PickRequestOptions = {
  /**
   * Overrides the distribution for this request. The output should satisfy
   * {@link inRange} for the request.
   */
  bias?: BiasedIntPicker;
};

/**
 * Requests a safe, non-negative integer in a given range, with optional hints
 * to the picker.
 *
 * When {@link IntPicker.isRandom} is true and {@link PickRequestOptions.bias}
 * isn't set, requests that the number should be picked using a uniform
 * distribution. Otherwise, the reply can be any number within range.
 */
export class PickRequest {
  /**
   * The distribution to use when picking randomly.
   *
   * The output is assumed to satisfy {@link PickRequest.inRange}.
   */
  readonly bias: BiasedIntPicker;

  /**
   * Constructs a request an integer in a given range.
   *
   * The range must be over non-negative integers and have at at least one
   * choice: min <= max.
   *
   * The request's default value will be the number closest to zero that's
   * between min and max, unless overridden by
   * {@link PickRequestOptions.default}.
   */
  constructor(
    readonly min: number,
    readonly max: number,
    opts?: PickRequestOptions,
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
      throw new Error(`invalid range: (${min}, ${max})`);
    }
    this.bias = opts?.bias ?? uniformBias(min, max);
  }

  get size(): number {
    return this.max - this.min + 1;
  }

  /** Returns true if the given number satisfies this request. */
  inRange(n: number): boolean {
    return inRange(n, this.min, this.max);
  }

  toString() {
    return `${this.min}..${this.max}`;
  }
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

  get length() {
    return this.#reqs.length;
  }

  reqs() {
    return this.#reqs.slice();
  }

  replies() {
    return this.#replies.slice();
  }

  isBit(i: number, expected?: number) {
    const req = this.#reqs[i];
    if (req.min !== 0 || req.max !== 1) {
      return false;
    }
    if (expected !== undefined) {
      return expected === this.#replies[i];
    }
    return true;
  }

  slice(start?: number, end?: number): PickList {
    return PickList.zip(
      this.#reqs.slice(start, end),
      this.#replies.slice(start, end),
    );
  }

  splice(start: number, deleteCount: number) {
    this.#reqs.splice(start, deleteCount);
    this.#replies.splice(start, deleteCount);
  }

  /** Removes trailing picks that are the same as the request's minimum value. */
  trim(): PickList {
    if (this.#reqs.length === 0) return this;

    let last = this.#reqs.length - 1;
    while (last >= 0 && this.#replies[last] === this.#reqs[last].min) {
      last--;
    }
    if (last === this.#reqs.length - 1) {
      return this;
    }
    return PickList.zip(
      this.#reqs.slice(0, last + 1),
      this.#replies.slice(0, last + 1),
    );
  }

  static zip(reqs: PickRequest[], replies: number[]) {
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
  static fromReplies(replies: number[]) {
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
