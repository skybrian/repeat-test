import type { Failure, Success } from "./results.ts";
import type { Pickable } from "./pickable.ts";
import type { PickSink } from "./picks.ts";
import type { GroupKey, MultiEdit } from "./edits.ts";
import type { Backtracker } from "./backtracking.ts";
import type { Call } from "./calls.ts";
import type { Script } from "./script_class.ts";

import { assert } from "@std/assert";
import { failure, filtered } from "./results.ts";
import { scriptFrom } from "./scripts/scriptFrom.ts";
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

function makeRegenerateFunction<T>(
  script: Script<T>,
  calls: Call[],
  val: T,
): () => T {
  return Object.isFrozen(val) ? () => val : () => {
    const next = replay(script, calls);
    assert(next !== filtered, "can't replay nondeterministic script");
    return next;
  };
}

export class MutableGen<T> {
  readonly #script: Script<T>;
  readonly #buf = new CallBuffer();
  #calls: Call[];
  #gen: Gen<T>;

  private constructor(origin: Gen<T>) {
    this.#script = scriptFromGen(origin);
    this.#calls = callsFromGen(origin);
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

    this.commit(result);
    return true;
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

    this.commit(result);
    return true;
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

  private commit(val: T): void {
    const calls = this.#buf.take();
    const regenerate = makeRegenerateFunction(this.#script, calls, val);
    this.#calls = calls;
    this.#gen = makeGen(this.#script, () => calls, regenerate);
  }

  static from<T>(gen: Gen<T>): MutableGen<T> {
    return new MutableGen(gen);
  }
}

/**
 * A generated value, along with the Script and calls that produced it.
 *
 * To create a Gen object, use {@link Gen.build}, {@link Gen.mustBuild},
 * the {@link generate} function, or a Domain.
 */
export class Gen<T> implements Success<T> {
  readonly #script: Script<T>;
  readonly #getCalls: () => Call[];
  readonly #result: () => T;

  private constructor(
    script: Script<T>,
    calls: () => Call[],
    result: () => T,
  ) {
    this.#script = script;
    this.#getCalls = calls;
    this.#result = result;
  }

  /** Satisfies the {@link Success} interface. */
  get ok(): true {
    return true;
  }

  /**
   * The name of whatever produced this value, for use in error messages.
   */
  get sourceName(): string {
    return this.#script.name;
  }

  /**
   * Returns the generated value, or a copy of it.
   *
   * For frozen objects, it might be the same value each time. Otherwise, the value
   * will be regenerated after the first access.
   */
  get val(): T {
    return this.#result();
  }

  /**
   * The replies to the PickRequests sent by the script, in the order they were
   * sent.
   */
  get replies(): Iterable<number> {
    return allReplies(this.#getCalls());
  }

  /**
   * Writes the requests and replies used to generate this value to the given
   * target.
   *
   * (Only includes PickRequests, not calls to other scripts.)
   *
   * Returns true if the target accepted every pick.
   */
  pushTo(target: PickSink): boolean {
    for (const call of this.#getCalls()) {
      const picks = call.group;
      if (!picks.pushTo(target)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Builds a pickable with the given reply to each pick request.
   *
   * Returns a {@link Failure} if the picks aren't accepted. Each reply must be
   * valid for the corresponding request, and the number of replies must match.
   */
  static build<T>(
    arg: Pickable<T>,
    replies: Iterable<number>,
  ): Gen<T> | Failure {
    const script = scriptFrom(arg, { caller: "Gen.build()" });
    const picker = new PlaybackPicker(replies);
    const gen = generate(script, onePlayout(picker));
    if (gen === filtered || picker.error !== undefined) {
      const err = picker.error ?? "picks not accepted";
      return failure(`can't build '${script.name}': ${err}`, replies);
    }
    return gen;
  }

  /**
   * Builds a pickable with the given reply to each pick request.
   *
   * This is just like {@link build} except that it throws an Error if the
   * picks aren't accepted.
   */
  static mustBuild<T>(arg: Pickable<T>, replies: Iterable<number>): Gen<T> {
    const gen = Gen.build(arg, replies);
    if (!gen.ok) {
      throw new Error(gen.message);
    }
    return gen;
  }

  /** Private. */
  private static makeGen<T>(
    script: Script<T>,
    getCalls: () => Call[],
    getResult: () => T,
  ): Gen<T> {
    return new Gen(script, getCalls, getResult);
  }

  /** Private. */
  private static scriptFromGen<T>(gen: Gen<T>): Script<T> {
    return gen.#script;
  }

  /** Private. */
  private static callsFromGen(gen: Gen<unknown>): Call[] {
    return gen.#getCalls();
  }
}

const makeGen = Gen["makeGen"];
const scriptFromGen = Gen["scriptFromGen"];
const callsFromGen = Gen["callsFromGen"];

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
  const script = scriptFrom(arg, { caller: "generate" });

  while (playouts.startAt(0)) {
    const log = new CallBuffer();
    const pick = makePickFunction(playouts, {
      ...opts,
      logPicks: log,
      logCalls: script.opts.logCalls ? log : undefined,
    });

    const val = script.run(pick);
    if (val === filtered) {
      continue;
    }
    if (!script.opts.logCalls) {
      // Treat it as a single call.
      log.endScript(script, val);
    }

    // Finished!
    let callCache: Call[] | undefined = undefined;
    const getCalls = () => {
      if (callCache === undefined) {
        callCache = log.take();
      }
      return callCache;
    };

    const getResult = cacheResult(script, getCalls, val);

    return makeGen(script, getCalls, getResult);
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
