import { assert } from "@std/assert";
import type { SystemConsole } from "./console.ts";
import type { BuildFunction, Pickable } from "./pickable.ts";

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

/**
 * A range of non-negative safe integers.
 *
 * Must contain one number: min <= max.
 */
export type Range = {
  readonly min: number;
  readonly max: number;
};

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
export class PickRequest implements Pickable<number>, Range {
  #random: RandomPicker;

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
    this.#random = opts?.bias ?? uniformPicker(min, max);
    Object.freeze(this);
  }

  /**
   * The function to call when picking randomly.
   *
   * The output is assumed to satisfy {@link PickRequest.inRange}.
   */
  get random(): RandomPicker {
    return this.#random;
  }

  /** Returns the next pick from the given source. */
  get buildFrom(): BuildFunction<number> {
    return (pick) => pick(this);
  }

  /** Returns true if the given number satisfies this request. */
  inRange(n: number): boolean {
    return Number.isSafeInteger(n) && n >= this.min && n <= this.max;
  }

  /** Returns the number of possible replies for this request. */
  get size(): number {
    return this.max - this.min + 1;
  }

  /** Describes the request's range, for debugging. */
  toString(): string {
    return `${this.min}..${this.max}`;
  }

  /**
   * A request for a single bit.
   */
  static readonly bit: PickRequest = new PickRequest(0, 1);
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

/** A request-reply pair. */
export type Pick = {
  req: Range;
  reply: number;
};

/** Something that accepts a stream of picks. */
export interface PickSink {
  /**
   * Accests a pick request and reply.
   *
   * If the sink doesn't want more picks, it can return false or throw an Error.
   */
  push(req: Range, pick: number): boolean;
}

export class PickLog {
  reqs: Range[] = [];
  replies: number[] = [];

  /** The start of the next view. */
  viewStart = 0;

  get length(): number {
    return this.reqs.length;
  }

  get nextViewLength(): number {
    return this.reqs.length - this.viewStart;
  }

  set nextViewLength(newVal: number) {
    const newLen = this.viewStart + newVal;
    assert(newLen >= this.viewStart && newLen <= this.length);
    this.reqs.length = newLen;
    this.replies.length = newLen;
  }

  push(req: Range, reply: number): void {
    this.reqs.push(req);
    this.replies.push(reply);
  }
}

export class PickView {
  constructor(
    private readonly log: PickLog,
    readonly start: number,
    readonly end: number,
  ) {}

  get length() {
    return this.end - this.start;
  }

  get reqs(): Range[] {
    return this.log.reqs.slice(this.start, this.end);
  }

  get replies(): number[] {
    return this.log.replies.slice(this.start, this.end);
  }

  getPick(index: number): Pick {
    return {
      req: this.log.reqs[this.start + index],
      reply: this.log.replies[this.start + index],
    };
  }

  /**
   * If the request at the given index is for a bit, returns the reply.
   */
  getOption(index: number): number | undefined {
    if (index >= this.length) {
      return undefined;
    }
    const req = this.log.reqs[this.start + index];
    if (req.min !== 0 || req.max !== 1) {
      return undefined;
    }
    return this.log.replies[this.start + index];
  }

  /**
   * Returns the length of the playout with default picks removed from the end.
   */
  get trimmedLength(): number {
    let last = this.end - 1;
    while (
      last >= this.start && this.log.replies[last] === this.log.reqs[last].min
    ) {
      last--;
    }
    return last + 1;
  }

  /**
   * Returns the requests and replies with default picks removed from the end.
   */
  trimmed(): PickView {
    const len = this.trimmedLength;
    return new PickView(
      this.log,
      this.start,
      this.start + len,
    );
  }

  /**
   * Writes each pick to a sink.
   */
  pushTo(sink: PickSink): boolean {
    for (let i = 0; i < this.length; i++) {
      const req = this.log.reqs[this.start + i];
      const reply = this.log.replies[this.start + i];
      if (!sink.push(req, reply)) {
        return false;
      }
    }
    return true;
  }

  static wrap(reqs: Range[], replies: number[]): PickView {
    const log = new PickLog();
    log.reqs = reqs;
    log.replies = replies;
    return new PickView(log, 0, reqs.length);
  }

  /**
   * Writes the picks to a console.
   */
  logTo(console: SystemConsole): void {
    for (let i = 0; i < this.length; i++) {
      const { req, reply } = this.getPick(i);
      console.log(`${i}: ${req.min}..${req.max} =>`, reply);
    }
  }

  static empty = PickView.wrap([], []);
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
Object.freeze(alwaysPickMin);

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
  Object.freeze(picker);
  return picker;
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
