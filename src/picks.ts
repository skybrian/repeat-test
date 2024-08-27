/**
 * A function that randomly picks an integer within the given range.
 *
 * Precondition: min and max are non-negative safe integers.
 * @returns a number satisfying min <= pick <= max.
 */
export type UniformRandomSource = (min: number, max: number) => number;

/**
 * Picks an integer, given a source of random numbers.
 *
 * The range is unspecified (given by context).
 *
 * @param uniform A source of random numbers.
 */
export type BiasedIntPicker = (uniform: UniformRandomSource) => number;

function uniformBias(min: number, max: number): BiasedIntPicker {
  return (uniform: UniformRandomSource) => uniform(min, max);
}

/** Options on a {@link PickRequest}. */
export type PickRequestOpts = {
  /**
   * Overrides the random distribution for this request. The output should be in
   * range for the request.
   */
  bias?: BiasedIntPicker;
};

/**
 * Requests a safe, non-negative integer in a given range, with optional hints
 * to the picker.
 *
 * When {@link IntPicker.isRandom} is true and {@link PickRequestOpts.bias}
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
   * {@link PickRequestOpts.default}.
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
    this.bias = opts?.bias ?? uniformBias(min, max);
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

const biasBins = 0x100000000;

/**
 * Creates a PickRequest that chooses between 0 and 1 with the given bias.
 *
 * (Note that the bias only matters when picking randomly.)
 *
 * @param probOne The probability of picking 1.
 */
export function biasedBitRequest(probOne: number): PickRequest {
  const bias = (uniform: UniformRandomSource) => {
    const threshold = Math.floor((1 - probOne) * biasBins);
    const choice = uniform(1, biasBins);
    return choice <= threshold ? 0 : 1;
  };
  return new PickRequest(0, 1, { bias });
}

/**
 * Creates a PickRequest that chooses a subrange and then a number within the
 * chosen subrange.
 *
 * This can be used to give each subrange an equal chance of being picked, even
 * if the ranges have very different sizes.
 *
 * (Note that the bias only matters when picking randomly.)
 *
 * @param starts the start of each range
 * @param lastMax the last choice in the last range
 * @returns a number satisfying start[0] <= n <= lastMax
 */
export function subrangeRequest(
  starts: number[],
  lastMax: number,
): PickRequest {
  const last = starts.length - 1;
  if (last < 0) {
    throw new Error("starts must be non-empty");
  }
  for (let i = 0; i <= last; i++) {
    if (!Number.isSafeInteger(starts[i])) {
      throw new Error(`starts[${i}] must be a safe integer; got ${starts[i]}`);
    }
  }
  if (!Number.isSafeInteger(lastMax)) {
    throw new Error(`lastMax must be a safe integer; got ${lastMax}`);
  }
  for (let i = 1; i <= last; i++) {
    if (starts[i] < starts[i - 1]) {
      throw new Error(
        `want: starts[${i}] >= ${starts[i - 1]}; got ${starts[i]}`,
      );
    }
  }
  if (lastMax < starts[last]) {
    throw new Error(`want: lastMax >= ${starts[last]}; got ${lastMax}`);
  }
  const bias = (uniform: UniformRandomSource) => {
    const choice = uniform(0, starts.length - 1);
    const min = starts[choice];
    const max = choice < starts.length - 1 ? starts[choice + 1] - 1 : lastMax;
    return uniform(min, max);
  };
  return new PickRequest(starts[0], lastMax, { bias });
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
