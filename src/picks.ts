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

  get range() {
    return [this.min, this.max];
  }

  /** Returns true if the given number satisfies this request. */
  inRange(n: number): boolean {
    return inRange(n, this.min, this.max);
  }

  toString() {
    return `PickRequest(${this.min}, ${this.max})`;
  }
}

/**
 * A state machine that picks an integer, given a request.
 * (Like an iterator, this is mutable.)
 */
export interface IntPicker {
  /**
   * True if this picker picks using an approximately uniform random
   * distribution when {@link PickRequest.bias} is not set.
   */
  get isRandom(): boolean;

  /**
   * Transitions to a new state and returns a pick satisfying
   * {@link PickRequest.inRange}.
   */
  pick(req: PickRequest): number;
}

export const alwaysPickMin: IntPicker = {
  get isRandom() {
    return false;
  },
  pick: (req) => req.min,
};

/**
 * Returns a single-state picker that always picks the same number.
 *
 * It will throw an exception if it can't satisfy a request.
 */
export function alwaysPick(n: number) {
  const picker: IntPicker = {
    get isRandom() {
      return false;
    },
    pick: (req) => {
      if (!req.inRange(n)) {
        throw new Error(
          `can't satisfy request for (${req.min}, ${req.max}) with ${n}`,
        );
      }
      return n;
    },
  };
  return picker;
}

export class PickList {
  #reqs: PickRequest[];
  #replies: number[];

  /**
   * Constructs a pick list with no alternative choices.
   *
   * Each request's range only includes the reply.
   */
  static fromReplies(replies: number[]) {
    return new PickList(replies.map((r) => new PickRequest(r, r)), replies);
  }

  constructor();
  constructor(reqs: PickRequest[], replies: number[]);
  constructor(reqs?: PickRequest[], replies?: number[]) {
    reqs = reqs ?? [];
    replies = replies ?? [];
    if (reqs.length !== replies.length) {
      throw new Error("reqs and replies must be the same length");
    }
    this.#reqs = reqs;
    this.#replies = replies;
  }

  get length() {
    return this.#reqs.length;
  }

  set length(val: number) {
    this.#reqs.length = val;
    this.#replies.length = val;
  }

  get reqs() {
    return this.#reqs.slice();
  }

  get replies() {
    return this.#replies.slice();
  }

  push(req: PickRequest, reply: number) {
    this.#reqs.push(req);
    this.#replies.push(reply);
  }

  slice(start?: number, end?: number): PickList {
    return new PickList(
      this.#reqs.slice(start, end),
      this.#replies.slice(start, end),
    );
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
    return new PickList(
      this.#reqs.slice(0, last + 1),
      this.#replies.slice(0, last + 1),
    );
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
      if (expected[i] < 0) {
        throw new Error("expected picks must be non-negative");
      }
      if (!Number.isSafeInteger(expected[i])) {
        throw new Error("expected picks must be safe integers");
      }
    }
  }

  get isRandom() {
    return false;
  }

  pick(req: PickRequest): number {
    if (this.depth >= this.expected.length) {
      this.depth++;
      return req.min;
    }
    let pick = this.expected[this.depth];
    if (!req.inRange(pick)) {
      if (this.rangeError === undefined) {
        this.rangeError =
          `pick at offset ${this.depth} doesn't satisfy the request.` +
          ` Want: (${req.min}, ${req.max}). Got: ${pick}`;
      }
      pick = req.min;
    }
    this.depth++;
    return pick;
  }

  get error(): string | undefined {
    if (this.rangeError) return this.rangeError;
    if (this.depth !== this.expected.length) {
      return `expected ${this.expected.length} picks; got ${this.depth}`;
    }
    return undefined;
  }
}
