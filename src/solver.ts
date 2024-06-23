import {
  alwaysPickDefault,
  IntPicker,
  ParserInput,
  PickRequest,
  PickState,
} from "./picks.ts";

/**
 * Records and replays picks made by underlying {@link IntPicker}.
 *
 * When recording, it pushes requests and responses on the stack.
 *
 * When replaying, it starts from the bottom of the stack and enforces that
 * requested ranges match. When it reaches the end of the stack, it starts
 * recording again.
 *
 * The stack can also be incremented like an odometer, which can be used for a
 * depth-first search of all possible replies to the recorded pick requests. See
 * {@link playNext}.
 */
export class PickStack {
  private readonly maxStackSize: number;

  // Invariant: reqs.length == recordedPicks.length == playPicks.length
  // (Parallel stacks.)

  /** The requests originally recorded. */
  private readonly reqs: PickRequest[] = [];

  /** The picks originally recorded. */
  private readonly recordedPicks: number[] = [];

  /**
   * The picks to use for playback.
   * (Some will be different from the recorded pick after calling {@link playNext}.)
   */
  private playPicks: number[] = [];

  private playOffset = 0;

  /** Used to give proxy IntPickers a unique id. */
  private proxyCount = 0;

  /**
   * Constructs a new, empty log, ready for recording.
   * @param wrapped the picker to use when recording picks
   */
  constructor(
    private readonly wrapped: IntPicker,
    opts?: { maxLogSize?: number },
  ) {
    this.maxStackSize = opts?.maxLogSize ?? 1000;
  }

  /** The number of requests that have been recorded. */
  get length() {
    return this.reqs.length;
  }

  /**
   * Returns true if there are recorded picks that haven't been replayed.
   */
  get playing() {
    return this.playOffset < this.reqs.length;
  }

  /**
   * Clears the log and starts recording. Returns the picker to use.
   *
   * The picker's lifetime is until the next call to either {@link record} or
   * {@link play}.
   */
  record(): IntPicker {
    this.reqs.length = 0;
    this.recordedPicks.length = 0;
    return this.play();
  }

  /**
   * Starts replaying the log, using a new picker. After reaching the end, it
   * will start recording again.
   *
   * The picker's lifetime is until the next call to either {@link record} or
   * {@link play}.
   */
  play(): IntPicker {
    this.playOffset = 0;

    this.proxyCount++;
    const id = this.proxyCount;

    const checkAlive = () => {
      if (id !== this.proxyCount) {
        throw new Error(
          "can't use this picker anymore, because record() or replay() were called",
        );
      }
    };

    const pick = (req: PickRequest): number => {
      checkAlive();

      if (this.playOffset < this.reqs.length) {
        // replaying
        const prev = this.reqs[this.playOffset];
        if (prev.min !== req.min || prev.max !== req.max) {
          throw new Error(
            "when replaying, pick() must be called with the same request as before",
          );
        }
        const pick = this.playPicks[this.playOffset];
        this.playOffset++;
        return pick;
      }

      // recording
      if (this.playOffset === this.maxStackSize) {
        throw new Error(
          `pick log is full (max size: ${this.maxStackSize})`,
        );
      }
      const pick = this.wrapped.pick(req);
      this.reqs.push(req);
      this.recordedPicks.push(pick);
      this.playPicks.push(pick);
      this.playOffset += 1;
      return pick;
    };

    const freeze = (): PickState => {
      checkAlive();
      return {
        start: () => new ParserInput(this.playPicks.slice(this.playOffset)),
      };
    };

    return { pick, freeze };
  }

  /**
   * Starts a replay using a combination of picks that was not recorded or
   * previously played back since the last recording. Returns null when all
   * combinations have been tried.
   *
   * It increments the top pick on the stack, wrapping around to the minimum
   * value if needed. If all picks have been used, it pops the stack and tries
   * again.
   */
  playNext(): IntPicker | null {
    const nextPick = (req: PickRequest, pick: number): number => {
      return (pick === req.max) ? req.min : pick + 1;
    };

    for (let i = this.length - 1; i >= 0; i--) {
      const req = this.reqs[i];
      const pick = this.playPicks[i];
      const next = nextPick(req, pick);
      if (next !== this.recordedPicks[i]) {
        this.playPicks[i] = next;
        return this.play();
      }

      // We exhausted all possibilties for the last pick request.
      this.reqs.pop();
      this.recordedPicks.pop();
      this.playPicks.pop();
    }

    // We exhausted all pick requests on the stack.
    return null;
  }
}

/**
 * Indicates a failed attempt to generate a value.
 */
export const NOT_FOUND = Symbol("not found");

/**
 * Walks a search tree and returns whatever is found at a leaf.
 *
 * Each leaf holds either a value or nothing (a dead end).
 */
export type WalkFunction<T> = (path: IntPicker) => T | typeof NOT_FOUND;

/**
 * Visits every leaf in a search tree in order, depth-first. Starts by taking
 * all default choices.
 */
export function* walkAllPaths<T>(walk: WalkFunction<T>): Generator<T> {
  const stack = new PickStack(alwaysPickDefault);
  let next: IntPicker | null = stack.record();
  while (next !== null) {
    const val = walk(next);
    if (val !== NOT_FOUND) {
      yield val;
    }
    if (stack.playing) {
      throw "didn't read every value";
    }
    next = stack.playNext();
  }
}
