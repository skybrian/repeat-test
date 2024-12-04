import { assert } from "@std/assert";
import type { SystemConsole } from "./console.ts";
import type { Pickable, PickFunction } from "./pickable.ts";

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

/** Options on a {@link IntRequest}. */
export type IntRequestOpts = {
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
export class IntRequest implements Pickable<number>, Range {
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
    opts?: IntRequestOpts,
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
   * The output is assumed to satisfy {@link IntRequest.inRange}.
   */
  random(source: RandomSource): number {
    return this.#random(source);
  }

  /**
   * Equivalent to `pick(request)`.
   *
   * Evaluating an IntRequest is a primitive operation, so it has to be handled
   * as a special case by the *pick* function. Therefore, calling `directBuild`
   * on a IntRequest isn't very useful. It's only needed to satisfy the
   * {@link Pickable} interface.
   */
  directBuild(pick: PickFunction): number {
    return pick(this);
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
  static readonly bit: IntRequest = new IntRequest(0, 1);
}

/**
 * Creates a IntRequest where {@link IntRequest.random} chooses 0 or 1
 * with the given probability.
 *
 * @param probOne The probability of picking 1.
 */
export function biasedBitRequest(probOne: number): IntRequest {
  // There are 2**32 bins and (2**32 + 1) places to put a partition.
  const threshold = Math.floor((1 - probOne) * 0x100000001) - 0x80000000;
  const bias = (next: RandomSource) => {
    return next() < threshold ? 0 : 1;
  };
  return new IntRequest(0, 1, { bias });
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

export interface Pushable {
  /** Returns true if all picks were pushed to the sink. */
  pushTo(sink: PickSink): boolean;
}

/**
 * Stores picks before creating a {@link PickList}.
 */
export class PickBuffer implements PickSink {
  readonly #reqs: Range[] = [];
  readonly #replies: number[] = [];
  #count = 0;

  get pushCount(): number {
    return this.#count;
  }

  reset() {
    this.#count = 0;
  }

  push(req: Range, reply: number): boolean {
    this.#reqs[this.#count] = req;
    this.#replies[this.#count] = reply;
    this.#count++;
    return true;
  }

  undoPushes(toRemove: number) {
    assert(toRemove <= this.pushCount);
    this.#count -= toRemove;
  }

  takeList(): PickList {
    if (this.#count === 0) {
      return PickList.empty;
    }

    const list = PickList.fromSlices(
      this.#reqs,
      this.#replies,
      0,
      this.#count,
    );

    this.#count = 0;
    return list;
  }
}

/**
 * A list of (request, reply) pairs.
 */
export class PickList implements Pushable {
  private constructor(
    readonly reqs: Range[],
    readonly replies: number[],
  ) {}

  get length() {
    return this.reqs.length;
  }

  reqAt(offset: number): Range {
    return this.reqs[offset];
  }

  replyAt(offset: number): number {
    return this.replies[offset];
  }

  diffAt(offset: number): number {
    if (offset >= this.length) {
      return 0;
    }
    const req = this.reqAt(offset);
    const reply = this.replyAt(offset);
    return reply - req.min;
  }

  getPick(offset: number): Pick {
    return {
      req: this.reqAt(offset),
      reply: this.replyAt(offset),
    };
  }

  /**
   * If the request at the given index is for a bit, returns the reply.
   */
  getOption(offset: number): number | undefined {
    if (offset >= this.length) {
      return undefined;
    }
    const req = this.reqAt(offset);
    if (req.min !== 0 || req.max !== 1) {
      return undefined;
    }
    return this.replyAt(offset);
  }

  /**
   * Returns the length that the list would be with default picks removed from
   * the end.
   */
  get trimmedLength(): number {
    let i = this.length - 1;
    while (i >= 0 && this.diffAt(i) === 0) {
      i--;
    }
    return i + 1;
  }

  /**
   * Returns a new list with default picks removed from the end.
   */
  trimmed(): PickList {
    const len = this.trimmedLength;
    return new PickList(this.reqs.slice(0, len), this.replies.slice(0, len));
  }

  /**
   * Writes each pick to a sink.
   *
   * Returns true if all picks were pushed.
   */
  pushTo(sink: PickSink): boolean {
    for (let i = 0; i < this.length; i++) {
      const req = this.reqs[i];
      const reply = this.replies[i];
      if (!sink.push(req, reply)) {
        return false;
      }
    }
    return true;
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

  static empty = PickList.wrap([], []);

  /**
   * Creates a PickList by wrapping two arrays, without copying them.
   */
  static wrap(reqs: Range[], replies: number[]): PickList {
    assert(reqs.length === replies.length);
    return new PickList(reqs, replies);
  }

  /**
   * Creates a PickList by slicing two parallel arrays.
   */
  static fromSlices(
    reqs: Range[],
    replies: number[],
    start: number,
    end: number,
  ): PickList {
    return new PickList(reqs.slice(start, end), replies.slice(start, end));
  }

  /**
   * Copies picks from a pushable source to a new list.
   */
  static copyFrom(source: Pushable): PickList {
    const buf = new PickBuffer();
    assert(source.pushTo(buf));
    return buf.takeList();
  }
}

/**
 * A state machine that picks an integer, given a request.
 * (Like an iterator, this is mutable.)
 */
export interface IntPicker {
  /**
   * Transitions to a new state and returns a pick satisfying
   * {@link IntRequest.inRange}.
   */
  pick(req: IntRequest): number;
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
  private readonly expected: number[] = [];
  private depth = 0;
  private rangeError?: string = undefined;

  constructor(expected: Iterable<number>) {
    let i = 0;
    for (const pick of expected) {
      if (!Number.isSafeInteger(pick)) {
        throw new Error(`${i}: expected a safe integer, got: ${pick}`);
      } else if (pick < 0) {
        throw new Error(`${i}: expected a non-negative integer, got: ${pick}`);
      }
      this.expected.push(pick);
      i++;
    }
  }

  pick(req: IntRequest): number {
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
