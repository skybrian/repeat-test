import type { Failure, Success } from "./results.ts";
import type { Pickable } from "./pickable.ts";
import type { PickList, PickSink, Range } from "./picks.ts";
import type { GroupKey, MultiEdit } from "./edits.ts";
import type { Backtracker } from "./backtracking.ts";
import type { CallLog } from "./calls.ts";

import { assert } from "@std/assert";
import { failure, filtered } from "./results.ts";
import { Script } from "./script_class.ts";
import { PlaybackPicker } from "./picks.ts";
import { onePlayout } from "./backtracking.ts";
import { makePickFunction } from "./build.ts";
import { CallBuffer, unchanged } from "./calls.ts";

export class MutableGen<T> {
  readonly #script: Script<T>;
  readonly #buf = new CallBuffer();
  #calls: CallLog;
  #gen: Gen<T>;

  constructor(script: Script<T>, calls: CallLog, origin: Gen<T>) {
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
    const result = this.#calls.runWithEdits(this.#script, edits, this.#buf);
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
    const result = this.#calls.runWithDeletedRange(
      this.#script,
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
    return this.#gen.groupKeys;
  }

  picksAt(key: GroupKey): PickList {
    return this.#gen.picksAt(key);
  }

  get val(): T {
    return this.#gen.val;
  }

  private commit(val: T): boolean {
    const calls = this.#buf.takeLog();
    const regenerate = Object.isFrozen(val) ? () => val : () => {
      const next = calls.run(this.#script);
      assert(next !== filtered, "can't rebuild nondeterministic script");
      return next;
    };

    this.#calls = calls;
    this.#gen = new Gen(this.#script, calls, regenerate);
    return true;
  }
}

/**
 * A generated value and the picks that were used to generate it.
 */
export class Gen<T> implements Success<T> {
  readonly #script: Script<T>;
  readonly #calls: CallLog;
  readonly #result: () => T;

  #reqs: Range[] | undefined;
  #replies: number[] | undefined;

  /**
   * Creates a generated value with the given contents.
   *
   * This constructor should not normally be called directly. Instead, use
   * the {@link generate} method or a {@link Domain}.
   */
  constructor(
    script: Script<T>,
    calls: CallLog,
    result: () => T,
  ) {
    this.#script = script;
    this.#calls = calls;
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
    return this.#calls.allReplies;
  }

  pushTo(sink: PickSink): boolean {
    for (const key of this.groupKeys) {
      const picks = this.picksAt(key);
      if (!picks.pushTo(sink)) {
        return false;
      }
    }
    return true;
  }

  /**
   * The key of each group of picks used to generate this value, in the order
   * they were used.
   */
  get groupKeys(): GroupKey[] {
    const len = this.#calls.length;
    return new Array(len).fill(0).map((_, i) => i);
  }

  /** Returns the picks for the given group, or an empty PickList if not found. */
  picksAt(key: GroupKey): PickList {
    assert(typeof key === "number");
    return this.#calls.groupAt(key);
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
    return new MutableGen(this.#script, this.#calls, this);
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
      log,
      logCalls: script.splitCalls,
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
    const calls = log.takeLog();
    const result = cacheResult(script, calls, val);
    return new Gen(script, calls, result);
  }
  return filtered;
}

const alwaysBuild = Symbol("alwaysBuild");

function cacheResult<T>(script: Script<T>, calls: CallLog, val: T): () => T {
  if (Object.isFrozen(val)) {
    return () => val;
  }

  let cache: T | typeof alwaysBuild = val;

  return () => {
    if (cache === alwaysBuild) {
      const next = calls.run(script);
      assert(next !== filtered, "can't rebuild nondeterministic script");
      return next;
    }
    const val = cache;
    cache = alwaysBuild;
    return val;
  };
}
