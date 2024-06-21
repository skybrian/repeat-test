import { Failure, Success, success } from "./results.ts";

/**
 * Randomly picks an integer from a uniform distribution.
 *
 * Invariant: min <= result <= max, where min and max are safe integers.
 */
export type UniformIntPicker = (min: number, max: number) => number;

/**
 * Randomly picks an integer from a possibly non-uniform distribution.
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
   * Overrides the default value for this request. This should be a value
   * between min and max.
   */
  default?: number;

  /**
   * Overrides the distribution for this request. The function should return a
   * random integer between min and max.
   */
  bias?: BiasedIntPicker;
};

function inRange(n: number, min: number, max: number) {
  return Number.isSafeInteger(n) && n >= min && n <= max;
}

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
  const chosenDefault = opts?.default;
  if (chosenDefault !== undefined) {
    if (!inRange(chosenDefault, min, max)) {
      throw new Error(
        `the default must be in the range (${min}, ${max}); got ${chosenDefault}`,
      );
    }
    return chosenDefault;
  } else if (min >= 0) {
    return min;
  } else if (max <= 0) {
    return max;
  } else {
    return 0;
  }
}

/**
 * Requests a integer within a given range, with options.
 */
export class PickRequest {
  /**
   * The distribution to use when picking randomly.
   *
   * Invariant: min <= bias(uniform) <= max, where all are safe integers.
   */
  readonly bias: BiasedIntPicker;

  /**
   * A default pick that can be used when not picking randomly.
   *
   * Invariant: min <= default <= max, where they are all safe integers.
   */
  readonly default: number;

  /**
   * Constructs a new request.
   *
   * When the result is picked randomly, it will use {@link uniformBias} unless
   * overridden by {@link PickRequestOptions.bias}.
   *
   * A request has a default value that may be used when not picking randomly.
   * If not specified using {@link PickRequestOptions.default}, it will be the
   * number closest to zero that's between min and max.
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

  /**
   * Returns true if the given number satisfies this request.
   */
  isValidReply(n: number): boolean {
    return inRange(n, this.min, this.max);
  }
}

/**
 * Picks an integer, given a request.
 *
 * Invariant: req.isValidReply(result).
 */
export interface IntPicker {
  pick(req: PickRequest): number;
}

export const alwaysChooseDefault: IntPicker = { pick: (req) => req.default };
export const alwaysChooseMin: IntPicker = { pick: (req) => req.min };

export interface ParseFailure<T> extends Failure {
  guess: T;
  errorOffset: number;
}

/**
 * Input to a parser that converts picks into a value.
 *
 * For a successful parse, the parser must take each pick given in the constructor.
 *
 * As a form of error recovery, invalid picks are skipped. If more picks are needed
 * after the input runs out, a request's default value will be returned.
 *
 * To check for a parse error after parsing is done, use {@link finish}.
 */
export class ParserInput implements IntPicker {
  offset: number = 0;
  errorOffset: number | null = null;

  constructor(private picks: number[]) {}

  pick(req: PickRequest): number {
    while (this.offset < this.picks.length) {
      const offset = this.offset++;
      const pick = this.picks[offset];
      if (req.isValidReply(pick)) {
        return pick;
      }
      if (this.errorOffset === null) {
        this.errorOffset = offset;
      }
      // retry with next value.
    }

    // ran off the end, so use the default value.
    if (this.errorOffset === null) {
      this.errorOffset = this.picks.length;
    }
    return req.default;
  }

  finish<T>(val: T): Success<T> | ParseFailure<T> {
    if (!this.errorOffset && this.offset !== this.picks.length) {
      this.errorOffset = this.offset;
    }

    if (this.errorOffset !== null) {
      return { ok: false, guess: val, errorOffset: this.errorOffset };
    }

    return success(val);
  }
}

/**
 * Records and replays picks made by a proxied {@link IntPicker}.
 *
 * To record, it returns a proxy IntPicker that passes requests to an underlying
 * picker and saves the requests and responses to the log.
 *
 * To replay, it returns another proxy IntPicker that throws an exception if a
 * mismatch is found (where the requested range doesn't match). After reaching
 * the end of the log, it will start recording again.
 */
export class PickLog {
  private readonly maxLogSize: number;
  private reqs: PickRequest[] = [];
  private picks: number[] = [];
  private offset = 0;
  private proxyCount = 0;

  /**
   * @param wrapped the picker to use when recording picks
   */
  constructor(
    private readonly wrapped: IntPicker,
    opts?: { maxLogSize?: number },
  ) {
    this.maxLogSize = opts?.maxLogSize ?? 1000;
  }

  /** The number of requests that have been recorded. */
  get length() {
    return this.reqs.length;
  }

  /**
   * Returns true if there are recorded picks that haven't been replayed.
   */
  get replaying() {
    return this.offset < this.picks.length;
  }

  /**
   * Clears the log and starts recording. Returns the picker to use.
   *
   * The picker's lifetime is until the next call to either {@link record} or
   * {@link replay}.
   */
  record(): IntPicker {
    this.reqs = [];
    this.picks = [];
    return this.replay();
  }

  /**
   * Starts replaying the log, using a new picker. After reaching the end, it
   * will start recording again.
   *
   * The picker's lifetime is until the next call to either {@link record} or
   * {@link replay}.
   */
  replay(): IntPicker {
    this.offset = 0;
    this.proxyCount++;
    const id = this.proxyCount;

    const pick = (req: PickRequest): number => {
      if (id !== this.proxyCount) {
        throw new Error(
          "can't use this picker anymore, because record() or replay() were called",
        );
      }
      if (this.offset < this.reqs.length) {
        // replaying
        const prev = this.reqs[this.offset];
        if (prev.min !== req.min || prev.max !== req.max) {
          throw new Error(
            "when replaying, pick() must be called with the same request as before",
          );
        }
        return this.picks[this.offset++];
      } else {
        if (this.offset === this.maxLogSize) {
          throw new Error(
            `pick log is full (max size: ${this.maxLogSize})`,
          );
        }
        // recording
        const pick = this.wrapped.pick(req);
        this.reqs.push(req);
        this.picks.push(pick);
        this.offset += 1;
        return pick;
      }
    };
    return { pick };
  }

  /**
   * Increments the log and starts replaying it.
   *
   * To increment, it removes all trailing picks that are at maximum, then
   * increments the last pick.
   *
   * If null is returned, there is no next log to replay (all picks were at
   * maximum, so they were removed).
   */
  replayNext(): IntPicker | null {
    while (this.length > 0) {
      const i = this.length - 1;
      const last = this.picks[i];
      if (last < this.reqs[i].max) {
        this.picks[i] = last + 1;
        return this.replay();
      }
      this.picks.pop();
      this.reqs.pop();
    }
    return null;
  }
}
