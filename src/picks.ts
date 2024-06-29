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

/** A request-reply pair that represents one call to an {@link IntPicker}. */
export type PickEntry = {
  req: PickRequest;
  reply: number;
};

/**
 * A sequence of (request, reply) pairs that can be appended to and truncated.
 *
 * It can be thought of as representing a log of {@link IntPicker} calls or a
 * path in a search tree from the root to a leaf.
 */
export interface PickPath {
  /**
   * The current depth in the tree. If depth is zero, the next addChild
   * call will define the root node.
   */
  readonly depth: number;

  /**
   * The list of ancestor nodes, from the root to the current parent.
   *
   * Each entry defines a parent node (including how many children it has) and
   * the child path that was selected.
   */
  readonly entries: PickEntry[];

  /** Returns the ancestor at the given depth. */
  entryAt(depth: number): PickEntry;

  /** The child node chosen under each parent. */
  readonly replies: number[];

  /**
   * Converts the current node into a parent and takes one of its branches.
   *
   * @param req defines the branches for the new parent.
   * @param pick the branch to take.
   */
  addChild(req: PickRequest, pick: number): void;

  /**
   * Removes children just added.
   *
   * The first part of the path is fixed, so the depth can't be less than the
   * original depth.
   *
   * After truncating, it's up to the caller to take a different path.
   */
  truncate(depth: number): void;
}

/**
 * A sequence of (request, reply) pairs that can be appended to, truncated, and
 * used as an iterator.
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

  /**
   * Returns true if any pick was changed since it was first logged.
   */
  get edited() {
    return this.picks.some((pick, i) => pick !== this.originals[i]);
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

  /**
   * Gets a view of the log as a {@link PickPath}. Any new child nodes added
   * will be appended to the log.
   *
   * Its methods will stop working (throwing an exception) the next time the log
   * is edited from outside the PickPath, or when another PickPath is created.
   */
  getPickPath(): PickPath {
    this.currentVersion++; // Invalidate any previous appender.
    const version = this.currentVersion;
    const startDepth = this.reqs.length;

    const getLog = (): PickLog => {
      if (this.currentVersion !== version) {
        throw new Error("logger's lifetime expired");
      }
      return this;
    };

    const view: PickPath = {
      get depth() {
        return getLog().reqs.length;
      },
      get replies() {
        return getLog().picks.slice();
      },
      get entries() {
        const log = getLog();
        return log.reqs.map((req, i) => ({
          req,
          reply: log.picks[i],
        }));
      },
      entryAt(index: number): PickEntry {
        const log = getLog();
        return {
          req: log.reqs[index],
          reply: log.picks[index],
        };
      },
      addChild(request: PickRequest, reply: number): void {
        const log = getLog();
        // push an entry without updating currentVersion,
        // so we don't invalidate the current PickPath.
        log.reqs.push(request);
        log.picks.push(reply);
        log.originals.push(reply);
      },
      truncate(depth: number): void {
        const log = getLog();
        if (depth < startDepth || depth > log.reqs.length) {
          throw new Error(
            `new depth not in range; want ${startDepth} <= depth <= ${log.reqs.length}, got ${depth}`,
          );
        }
        log.reqs.length = depth;
        log.picks.length = depth;
        log.originals.length = depth;
      },
    };
    return view;
  }
}

/**
 * Iterates over unvisited leaves in a search tree, using a {@link PickPath} to
 * extend the path to each leaf.
 *
 * During each iteration, calling {@link PickPath.addChild} extends the search
 * tree. For example, the first addChild() call on the first iteration defines
 * the root and picks the root's first child to visit. All the other children
 * will be visited on future iterations.
 *
 * Previously defined tree nodes can't be changed. They will already be added to
 * the PickPath when it's yielded.
 *
 * The caller needs to call addChild() until it gets to a leaf before moving to
 * the next path. For each new parent, it can choose any child it wants to visit
 * first. The iterator chooses the order of the other children.
 *
 * Iteration stops when there are no unexplored parts of the tree that can be
 * reached by backtracking.
 */
export function* everyPath(): IterableIterator<PickPath> {
  const log = new PickLog();
  while (true) {
    yield log.getPickPath();
    if (!log.next()) {
      break;
    }
  }
}

/**
 * A function defining all possible paths in a search tree.
 *
 * The pick requests made by the function determine the structure of the tree.
 * Each request represents a node in the tree. The request's range determines
 * how many branches there are at that node.
 *
 * A PickTree function may call {@link IntPicker.pick} any number of times
 * before returning. Each pick represents a node along a path from the root of
 * the tree to a leaf, which is the last reply to the last pick.
 *
 * The function will be called many times to explore different parts of the
 * tree. To ensure that the search tree doesn't change, the pick requests that
 * it makes should be entirely determined by previous picks.
 */
export type PickTree = (input: IntPicker) => void;
