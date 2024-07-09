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
   * Overrides the default value for this request. This number should satisfy
   * {@link inRange} for the request.
   */
  default?: number;

  /**
   * Overrides the distribution for this request. The output should satisfy
   * {@link inRange} for the request.
   */
  bias?: BiasedIntPicker;
};

/**
 * Chooses a suitable default for an integer range.
 *
 * If not overridden, it's the number closest to zero between min and max.
 */
export function chooseDefault(
  min: number,
  max: number,
  opts?: { default?: number },
) {
  const override = opts?.default;
  if (override !== undefined) {
    if (!inRange(override, min, max)) {
      throw new Error(
        `the default must be in the range (${min}, ${max}); got ${override}`,
      );
    }
    return override;
  } else if (min >= 0) {
    return min;
  } else if (max <= 0) {
    return max;
  } else {
    return 0;
  }
}

/**
 * Requests a safe integer in a given range, with optional hints to the picker.
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
   * A default pick that can be used when not picking randomly.
   *
   * Invariant: satisfies {@link inRange}.
   */
  readonly default: number;

  /**
   * Constructs a new request.
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
    if (!Number.isSafeInteger(min)) {
      throw new Error(`min must be a safe integer; got ${min}`);
    }
    if (!Number.isSafeInteger(max)) {
      throw new Error(`max must be a safe integer; got ${max}`);
    }
    if (min > max) {
      throw new Error(
        `the range (min, max) must not be empty; got ${min} > ${max}`,
      );
    }
    this.default = chooseDefault(min, max, opts);
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

export const alwaysPickDefault: IntPicker = {
  isRandom: false,
  pick: (req) => req.default,
};

export const alwaysPickMin: IntPicker = {
  isRandom: false,
  pick: (req) => req.min,
};

/**
 * Returns a single-state picker that always picks the same number.
 *
 * It will throw an exception if it can't satisfy a request.
 */
export function alwaysPick(n: number) {
  const picker: IntPicker = {
    isRandom: false,
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

/**
 * A picker that can back up to a previous point in a pick sequence and try a
 * different path.
 */
export interface RetryPicker extends IntPicker {
  /**
   * The number of picks so far. Also, the current depth in a search tree.
   */
  get depth(): number;

  /**
   * Returns true if the picker is replaying a previously-determined pick
   * sequence.
   *
   * While replay is true, calls to {@link RetryPicker.pick} have to pass in a
   * request with the same range as last time, or it will throw an Error.
   *
   * (It will diverge before replaying the entire sequence.)
   */
  get replaying(): boolean;

  /**
   * Attempts to finish the current playout and return to a previous point in
   * the pick sequence where there is another playout.
   *
   * If successful, the picker might start replaying previous picks. (See
   * {@link replaying}.)
   *
   * If it fails, there's no next playout at the given depth, and the caller
   * should try again with a lower depth.
   *
   * If `backTo(0)` return false, the entire tree has been searched.
   */
  backTo(depth: number): boolean;

  /**
   * Returns the picks made so far.
   */
  getPicks(): number[];
}

/**
 * Converts an IntPicker to a RetryPicker, without backtracking.
 *
 * It just logs the picks.
 */
export function retryPicker(picker: IntPicker, maxTries: number): RetryPicker {
  const picks: number[] = [];
  let tries = 0;

  return {
    get isRandom() {
      return picker.isRandom;
    },
    get depth() {
      return picks.length;
    },
    get replaying() {
      return false;
    },

    pick(req) {
      const pick = picker.pick(req);
      picks.push(pick);
      return pick;
    },
    backTo: function (depth: number): boolean {
      tries += 1;
      if (tries >= maxTries) return false;
      picks.length = depth;
      return true;
    },

    getPicks: function (): number[] {
      return picks.slice();
    },
  };
}

/**
 * A picker that provides a single playout and checks for mismatches.
 */
export class StrictPicker implements RetryPicker {
  private actual: number[] = [];
  private rangeError?: string = undefined;

  constructor(private readonly expected: number[]) {}

  get isRandom() {
    return false;
  }

  get depth() {
    return this.actual.length;
  }

  getPicks(): number[] {
    return this.actual.slice();
  }

  get replaying(): boolean {
    return this.actual.length < this.expected.length;
  }

  backTo(_depth: number): boolean {
    return false;
  }

  pick(req: PickRequest): number {
    if (this.actual.length >= this.expected.length) {
      this.actual.push(req.default);
      return req.default;
    }
    const pick = this.expected[this.actual.length];
    if (!req.inRange(pick) && this.rangeError === undefined) {
      this.rangeError =
        `pick at offset ${this.actual.length} is not in requested range. Want: (${req.min}, ${req.max}). Got: ${pick}`;
      this.actual.push(req.default);
      return req.default;
    }
    this.actual.push(pick);
    return pick;
  }

  get error(): string | undefined {
    if (this.rangeError) return this.rangeError;
    if (this.actual.length !== this.expected.length) {
      return `expected ${this.expected.length} picks; got ${this.actual.length}`;
    }
    return undefined;
  }
}

/** A request-reply pair that represents one call to an {@link IntPicker}. */
export type PickEntry = {
  req: PickRequest;
  reply: number;
};

/**
 * A sequence of (request, reply) pairs that can be appended to and used as an
 * iterator.
 *
 * It can be thought of as representing a log of {@link IntPicker} calls, a path
 * in a search tree from the root to a leaf, or as a stack used to iterate over
 * all possible picks.
 *
 * When the log is iterated, it corresponds to choosing a different branch. The
 * log keeps track of the first iteration (first child visited) so that we can
 * stop iterating before a repeat.
 */
export class PickLog {
  // Invariant: reqs.length == picks.length == originals.length (Parallel lists.)

  private readonly reqs: PickRequest[] = [];

  /** The replies as originally logged, before modification. */
  private readonly originals: number[] = [];

  /** The current value of each reply. */
  private readonly picks: number[] = [];

  private currentVersion = 0;

  get length(): number {
    return this.reqs.length;
  }

  entryAt(index: number): PickEntry {
    return {
      req: this.reqs[index],
      reply: this.picks[index],
    };
  }

  /**
   * Returns true if any pick was changed since it was first logged.
   */
  get edited() {
    return this.picks.some((pick, i) => pick !== this.originals[i]);
  }

  /**
   * Returns true if there are more unvisited children for requests at the given
   * depth or greater.
   */
  morePathsAt(depth: number): boolean {
    if (depth < 0) {
      throw new Error(`depth out of range; want depth >= 0, got ${depth}`);
    }
    if (depth >= this.reqs.length) {
      return false;
    }
    for (let i = this.reqs.length - 1; i >= depth; i--) {
      const req = this.reqs[i];
      const pick = this.picks[i];
      const next = (pick === req.max) ? req.min : pick + 1;
      if (next !== this.originals[i]) {
        return true;
      }
    }
    return false;
  }

  get replies(): number[] {
    return this.picks.slice();
  }

  push(request: PickRequest, reply: number): void {
    this.currentVersion++;
    this.reqs.push(request);
    this.picks.push(reply);
    this.originals.push(reply);
  }

  /**
   * Increments the last pick, wrapping around to the minimum value if needed.
   * Returns true if it's different than the original value.
   *
   * From a search tree perspective, this points the log at the next child.
   */
  private rotateLast(): boolean {
    this.currentVersion++;
    if (this.reqs.length === 0) {
      throw new Error("log is empty");
    }
    const req = this.reqs[this.reqs.length - 1];
    const pick = this.picks[this.picks.length - 1];
    const next = (pick === req.max) ? req.min : pick + 1;
    this.picks[this.picks.length - 1] = next;
    return next !== this.originals[this.originals.length - 1];
  }

  /**
   * Rotates one pick in the log to a value that hasn't been seen before,
   * after backtracking if necessary.
   *
   * Returns false if all possibilities have been tried. (The log will be
   * empty.)
   *
   * From a search tree perspective, this points the path at a previously
   * unvisited leaf node.
   */
  next(): boolean {
    this.currentVersion++;
    while (this.reqs.length > 0) {
      if (this.rotateLast()) {
        return true;
      }
      this.reqs.pop();
      this.picks.pop();
      this.originals.pop();
    }
    return false;
  }
}

export type DepthFirstPickerOpts = {
  /**
   * Called to pick the reply when a tree node is first visited.
   * This determines the first child to be visited.
   */
  firstChildPicker?: IntPicker;

  /**
   * Sets a limit for how deep the tree can get. After this point,
   * the picker will always return the request's default value.
   * (No new branches.)
   */
  maxDepth?: number;
};

export class DepthFirstPicker implements RetryPicker {
  private childPicker: IntPicker;
  private maxDepth: number;
  private readonly log = new PickLog();
  private offset = 0;

  constructor(opts?: DepthFirstPickerOpts) {
    this.childPicker = opts?.firstChildPicker ?? alwaysPickDefault;
    this.maxDepth = opts?.maxDepth ?? 1000;
  }

  asPickers(): IterableIterator<RetryPicker> {
    let firstTime = true;
    const pickers: IterableIterator<RetryPicker> = {
      [Symbol.iterator]: function (): IterableIterator<RetryPicker> {
        return pickers;
      },
      next: (): IteratorResult<RetryPicker, void> => {
        if (!firstTime && !this.backTo(0)) {
          return { done: true, value: undefined };
        }
        firstTime = false;
        return { done: false, value: this };
      },
    };
    return pickers;
  }

  get isRandom(): boolean {
    return false;
  }

  pick(req: PickRequest): number {
    if (this.offset < this.log.length) {
      const next = this.log.entryAt(this.offset);
      if (req.min !== next.req.min || req.max !== next.req.max) {
        throw new Error(
          `unexpected request while replaying: want ${next.req.range}, got ${req.range}`,
        );
      }
      this.offset++;
      return next.reply;
    } else if (this.offset >= this.maxDepth) {
      return req.default;
    }
    const reply = this.childPicker.pick(req);
    this.log.push(req, reply);
    this.offset++;
    return reply;
  }

  get depth() {
    return this.offset;
  }

  getPicks(): number[] {
    return this.log.replies;
  }

  get replaying() {
    return this.offset < this.log.length;
  }

  backTo(depth: number): boolean {
    if (this.offset < this.log.length) {
      throw new Error(`can't backtrack when not at the end of a path`);
    }
    if (depth < 0 || depth > this.offset) {
      throw new Error(
        `invalid depth for backTo(): want 0 <= depth <= ${this.offset}, got ${depth}`,
      );
    }
    if (!this.log.morePathsAt(depth)) {
      return false;
    }
    this.log.next();
    this.offset = depth;
    if (this.log.length < this.offset) {
      throw new Error("unexpected end of log; shouldn't happen");
    }
    return true;
  }
}
