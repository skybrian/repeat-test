import type { Failure, Success } from "./results.ts";
import type { Pickable } from "./pickable.ts";
import type { PickSink } from "./picks.ts";
import type { GroupKey, MultiEdit } from "./edits.ts";
import type { Backtracker } from "./backtracking.ts";
import type { Call } from "./calls.ts";

import { assert } from "@std/assert";
import { failure, filtered } from "./results.ts";
import { Script } from "./script_class.ts";
import { PickList, PlaybackPicker } from "./picks.ts";
import { onePlayout } from "./backtracking.ts";
import { makePickFunction } from "./build.ts";
import { allReplies, CallBuffer } from "./calls.ts";
import {
  replay,
  replayWithDeletedRange,
  replayWithEdits,
  unchanged,
} from "./replay.ts";

export class MutableGen<T> {
  readonly #script: Script<T>;
  readonly #buf = new CallBuffer();
  #calls: Call[];
  #gen: Gen<T>;

  constructor(script: Script<T>, calls: Call[], origin: Gen<T>) {
    this.#script = script;
    this.#calls = calls;
    this.#gen = origin;
  }

  /**
   * Returns true if the edits could be applied and the result passes the test
   * (if provided).
   */
  tryEdits(edits: MultiEdit, test?: (val: T) => boolean): boolean {
    this.#buf.reset();
    const result = replayWithEdits(this.#script, this.#calls, edits, this.#buf);
    if (result === filtered) {
      return false; // edits didn't apply
    } else if (result === unchanged) {
      return true; // edits applied, but had no effect
    }

    if (test && !test(result)) {
      return false; // didn't pass the test
    }

    return this.commit(result);
  }

  tryDeleteRange(
    start: number,
    end: number,
    test?: (val: T) => boolean,
  ): boolean {
    this.#buf.reset();
    const result = replayWithDeletedRange(
      this.#script,
      this.#calls,
      start,
      end,
      this.#buf,
    );
    if (result === filtered) {
      return false; // edits didn't apply
    } else if (result === unchanged) {
      return true; // edits applied, but had no effect
    }

    if (test && !test(result)) {
      return false; // didn't pass the test
    }

    return this.commit(result);
  }

  get gen(): Gen<T> {
    return this.#gen;
  }

  get groupKeys(): GroupKey[] {
    const len = this.#calls.length;
    return new Array(len).fill(0).map((_, i) => i);
  }

  picksAt(key: GroupKey): PickList {
    assert(typeof key === "number");
    const call = this.#calls[key];
    return call ? call.group : PickList.empty;
  }

  get val(): T {
    return this.#gen.val;
  }

  private commit(val: T): boolean {
    const calls = this.#buf.take();

    const regenerate = Object.isFrozen(val) ? () => val : () => {
      const next = replay(this.#script, calls);
      assert(next !== filtered, "can't rebuild nondeterministic script");
      return next;
    };
    this.#gen = new Gen(this.#script, () => calls, regenerate);
    this.#calls = calls;
    return true;
  }
}

/**
 * A generated value and the picks that were used to generate it.
 */
export class Gen<T> implements Success<T> {
  readonly #script: Script<T>;
  readonly #getCalls: () => Call[];
  readonly #result: () => T;

  /**
   * Creates a generated value with the given contents.
   *
   * This constructor should not normally be called directly. Instead, use
   * the {@link generate} method or a {@link Domain}.
   */
  constructor(
    script: Script<T>,
    calls: () => Call[],
    result: () => T,
  ) {
    this.#script = script;
    this.#getCalls = calls;
    this.#result = result;
  }

  /** Satisfies the Success interface. */
  get ok(): true {
    return true;
  }

  get name(): string {
    return this.#script.name;
  }

  get replies(): Iterable<number> {
    return allReplies(this.#getCalls());
  }

  pushTo(sink: PickSink): boolean {
    for (const call of this.#getCalls()) {
      const picks = call.group;
      if (!picks.pushTo(sink)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Returns the value that was generated.
   *
   * If not a frozen value, accessing this property will generate a new clone
   * each time after the first access.
   */
  get val(): T {
    return this.#result();
  }

  toMutable(): MutableGen<T> {
    return new MutableGen(this.#script, this.#getCalls(), this);
  }

  static mustBuild<T>(arg: Pickable<T>, replies: Iterable<number>): Gen<T> {
    const gen = Gen.build(arg, replies);
    if (!gen.ok) {
      throw new Error(gen.message);
    }
    return gen;
  }

  static build<T>(
    arg: Pickable<T>,
    replies: Iterable<number>,
  ): Gen<T> | Failure {
    const script = Script.from(arg, { caller: "Gen.build()" });
    const picker = new PlaybackPicker(replies);
    const gen = generate(script, onePlayout(picker));
    if (gen === filtered || picker.error !== undefined) {
      const err = picker.error ?? "picks not accepted";
      return failure(`can't build '${script.name}': ${err}`);
    }
    return gen;
  }
}

export type GenerateOpts = {
  /**
   * A limit on the number of picks to generate normally during a playout. It
   * can be used to limit the size of generated objects.
   *
   * Once the limit is reached, the {@link PickFunction} will always generate
   * the default value for any sub-objects being generated.
   */
  limit?: number;
};

/**
 * Generates a value from a source of playouts.
 *
 * Returns {@link filtered} if no playout was accepted.
 */
export function generate<T>(
  arg: Pickable<T>,
  playouts: Backtracker,
  opts?: GenerateOpts,
): Gen<T> | typeof filtered {
  const script = Script.from(arg, { caller: "generate" });

  while (playouts.startAt(0)) {
    const log = new CallBuffer();
    const pick = makePickFunction(playouts, {
      ...opts,
      logPicks: log,
      logCalls: script.splitCalls ? log : undefined,
    });

    const val = script.run(pick);
    if (val === filtered) {
      continue;
    }
    if (!script.splitCalls) {
      // Treat it as a single call.
      log.endScript(script, val);
    }

    // Finished!
    let callCache: Call[] | undefined = undefined;
    const calls = () => {
      if (callCache === undefined) {
        callCache = log.take();
      }
      return callCache;
    };
    const result = cacheResult(script, calls, val);
    return new Gen(script, calls, result);
  }
  return filtered;
}

const alwaysBuild = Symbol("alwaysBuild");

function cacheResult<T>(
  script: Script<T>,
  calls: () => Call[],
  val: T,
): () => T {
  if (Object.isFrozen(val)) {
    return () => val;
  }

  let cache: T | typeof alwaysBuild = val;

  return () => {
    if (cache === alwaysBuild) {
      const next = replay(script, calls());
      assert(next !== filtered, "can't rebuild nondeterministic script");
      return next;
    }
    const val = cache;
    cache = alwaysBuild;
    return val;
  };
}
