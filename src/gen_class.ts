import type { Failure, Success } from "./results.ts";
import type { Pickable } from "./pickable.ts";
import type { PickView, Range } from "./picks.ts";
import type { StepEditor, StepKey } from "./edits.ts";
import type { Backtracker } from "./backtracking.ts";
import type { CallLog } from "./calls.ts";

import { assert } from "@std/assert";
import { failure, filtered } from "./results.ts";
import { Script } from "./script_class.ts";
import { PlaybackPicker } from "./picks.ts";
import { onePlayout } from "./backtracking.ts";
import { makePickFunction, usePicks } from "./build.ts";
import { CallBuffer } from "./calls.ts";

type Props<T> = {
  readonly script: Script<T>;
  readonly calls: CallLog;
  readonly val: T;
};

const alwaysBuild = Symbol("alwaysBuild");

/**
 * A Done result that rebuilds the value after its first access.
 *
 * (For returning mutable objects.)
 */
function cacheOnce<T>(val: T, build: () => T): () => T {
  let cache: T | typeof alwaysBuild = val;

  return () => {
    if (cache === alwaysBuild) {
      return build();
    }
    const val = cache;
    cache = alwaysBuild;
    return val;
  };
}

function cacheResult<T>(props: Props<T>): () => T {
  const { script, calls, val } = props;
  if (Object.isFrozen(props.val)) {
    return () => val;
  }

  const lastReplies = calls.replies;
  const regenerate = (): T => {
    const next = script.build(usePicks(...lastReplies));
    assert(
      next !== filtered,
      "can't regenerate value of nondeterministic step",
    );
    return next;
  };

  return cacheOnce(val, regenerate);
}

function mutateImpl<T>(
  props: Props<T>,
  editors: StepEditor,
): Props<T> | typeof filtered {
  const { script, calls } = props;

  const buf = new CallBuffer(calls);
  const next = calls.tryEdit(script, editors, buf);
  if (next === filtered) {
    return filtered;
  } else if (!buf.changed) {
    return props;
  }

  return {
    script,
    calls: buf.takeLog(),
    val: next,
  };
}

export class MutableGen<T> {
  #props: Props<T>;
  #gen: Gen<T>;

  constructor(props: Props<T>, origin: Gen<T>) {
    this.#props = props;
    this.#gen = origin;
  }

  /**
   * Returns true if the edits could be applied and the result passes the test
   * (if provided).
   */
  tryMutate(
    editor: StepEditor,
    test?: (val: T) => boolean,
  ): boolean {
    const next = mutateImpl(this.#props, editor);
    if (next === filtered) {
      return false; // edits didn't apply
    }

    if (next === this.#props) {
      return true; // edits applied, but had no effect
    }

    const cache = cacheResult(next);
    if (test && !test(cache())) {
      return false; // didn't pass the test
    }

    this.#props = next;
    this.#gen = new Gen(next, cache);
    return true;
  }

  get gen(): Gen<T> {
    return this.#gen;
  }

  get stepKeys(): StepKey[] {
    return this.#gen.stepKeys;
  }

  getPicks(key: StepKey): PickView {
    return this.#gen.getPicks(key);
  }

  get val(): T {
    return this.#gen.val;
  }
}

/**
 * A generated value and the picks that were used to generate it.
 */
export class Gen<T> implements Success<T> {
  readonly #props: Props<T>;
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
    props: Props<T>,
    result?: () => T,
  ) {
    this.#props = props;
    this.#result = result ?? cacheResult(props);
  }

  /** Satisfies the Success interface. */
  get ok(): true {
    return true;
  }

  get name(): string {
    return this.#props.script.name;
  }

  get replies(): number[] {
    return this.#props.calls.replies;
  }

  get picks(): PickView {
    return this.#props.calls.pickView;
  }

  /**
   * The number of steps that were needed to generate this value.
   *
   * (Some steps might use zero picks.)
   */
  get stepKeys(): StepKey[] {
    const len = this.#props.calls.length;
    return new Array(len).fill(0).map((_, i) => i);
  }

  /** Returns the picks for the given step, or an empty PickList if not found. */
  getPicks(key: StepKey): PickView {
    assert(typeof key === "number");
    return this.#props.calls.picksAt(key);
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
    return new MutableGen(this.#props, this);
  }

  static mustBuild<T>(arg: Pickable<T>, replies: number[]): Gen<T> {
    const gen = Gen.build(arg, replies);
    if (!gen.ok) {
      throw new Error(gen.message);
    }
    return gen;
  }

  static build<T>(arg: Pickable<T>, replies: number[]): Gen<T> | Failure {
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

    const next = script.build(pick);
    if (next === filtered) {
      continue;
    }
    if (!script.splitCalls) {
      // Treat it as a single call.
      log.endScript(script, next);
    }
    return new Gen({
      script,
      calls: log.takeLog(),
      val: next,
    }); // finished
  }
  return filtered;
}
