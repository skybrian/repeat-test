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
 * Requests a integer within a given range, with optional hints to the picker.
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
   * When picking randomly, uses a uniform distribution unless overridden by
   * {@link PickRequestOptions.bias}.
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

  /** Returns true if the given number satisfies this request. */
  inRange(n: number): boolean {
    return inRange(n, this.min, this.max);
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

// TODO: consider removing SaveablePicker.
// It's not used yet.

/**
 * A picker that can be cloned.
 */
export interface SavablePicker extends IntPicker {
  /** Makes a copy of the picker's current state. */
  save(): PickerState;
}

/**
 * An immutable starting point for creating identical copies of an
 * {@link IntPicker}. It represents a single state of the picker's state
 * machine.
 */
export interface PickerState {
  start(): IntPicker;
}

export const alwaysPickDefault: SavablePicker = {
  pick: (req) => req.default,
  save: () => ({ start: () => alwaysPickDefault }),
};

export const alwaysPickMin: SavablePicker = {
  pick: (req) => req.min,
  save: () => ({ start: () => alwaysPickMin }),
};

/**
 * Returns a single-state picker that always picks the same number.
 *
 * It will throw an exception if it can't satisfy a request.
 */
export function alwaysPick(n: number) {
  const picker: SavablePicker = {
    pick: (req) => {
      if (!req.inRange(n)) {
        throw new Error(
          `can't satisfy request for (${req.min}, ${req.max}) with ${n}`,
        );
      }
      return n;
    },
    save: () => ({ start: () => picker }),
  };
  return picker;
}

type PickLogEntry = {
  req: PickRequest;
  pick: number;
};

/**
 * A history of pick requests and responses.
 *
 * The picks in the history can be modified.
 */
export class PickLog {
  // Invariant: reqs.length == picks.length == originals.length (Parallel lists.)

  private readonly reqs: PickRequest[] = [];

  /** The replies as originally pushed, before modification. */
  private readonly originals: number[] = [];

  /** The current value of each reply. */
  private readonly picks: number[] = [];

  get length() {
    return this.reqs.length;
  }

  /**
   * Returns true if any pick was changed.
   */
  get changed() {
    return this.picks.some((pick, i) => pick !== this.originals[i]);
  }

  get replies(): number[] {
    return this.picks.slice();
  }

  getEntry(index: number): PickLogEntry {
    return {
      req: this.reqs[index],
      pick: this.picks[index],
    };
  }

  truncate(pickCount: number): void {
    if (pickCount < 0 || pickCount > this.length) {
      throw new Error(`new pickCount not in range; got ${pickCount}`);
    }
    this.reqs.length = pickCount;
    this.picks.length = pickCount;
    this.originals.length = pickCount;
  }

  push(request: PickRequest, response: number): void {
    this.reqs.push(request);
    this.picks.push(response);
    this.originals.push(response);
  }

  /**
   * Increments the last pick, wrapping around to the minimum value if needed.
   * Returns true if it's different than the original value.
   */
  rotateLast(): boolean {
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
   * Mutates the pick log to a new, unseen value.
   *
   * Returns false if all possibilities have been tried.
   *
   * This can be used to do a depth-first search of all possible pick sequences.
   */
  increment(): boolean {
    while (this.length > 0) {
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
