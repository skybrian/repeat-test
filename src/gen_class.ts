import type { Failure, Success } from "./results.ts";
import type { Pickable } from "./pickable.ts";
import type { Range } from "./picks.ts";
import type { StepEditor, StepKey } from "./edits.ts";
import type { Backtracker } from "./backtracking.ts";

import { assert } from "@std/assert";
import { failure, filtered } from "./results.ts";
import { Script } from "./script_class.ts";
import { PickView, PlaybackPicker } from "./picks.ts";
import { keep, PickEditor } from "./edits.ts";
import { onePlayout } from "./backtracking.ts";
import { makePickFunction, usePicks } from "./build.ts";
import { CallBuffer, type CallLog } from "./calls.ts";

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
  buf: CallBuffer,
): Props<T> | typeof filtered {
  const { script, calls } = props;

  const editor = editors(0);

  if (editor === keep) {
    // no change
    return props;
  }

  const picks = new PickEditor(calls.replies, editor);
  const next = script.build(makePickFunction(picks, { log: buf }));
  if (next === filtered) {
    buf.reset();
    return filtered; // failed edit
  } else if (!picks.edited) {
    // no change
    buf.reset();
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
  #buf = new CallBuffer();
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
    const next = mutateImpl(this.#props, editor, this.#buf);
    if (next === filtered) {
      this.#buf.reset();
      return false; // edits didn't apply
    }

    if (next === this.#props) {
      this.#buf.reset();
      return true; // edits applied, but had no effect
    }

    const cache = cacheResult(next);
    if (test && !test(cache())) {
      this.#buf.reset();
      return false; // didn't pass the test
    }

    this.#props = next;
    this.#buf = new CallBuffer();
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

  #picksByKey: Map<StepKey, PickView>;
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
    this.#picksByKey = new Map();
    this.#picksByKey.set(0, props.calls.pickView);
  }

  /** Satisfies the Success interface. */
  get ok(): true {
    return true;
  }

  get name(): string {
    return this.#props.script.name;
  }

  get reqs(): Range[] {
    if (this.#reqs === undefined) {
      const reqs: Range[] = [];
      for (const picks of this.#picksByKey.values()) {
        reqs.push(...picks.reqs);
      }
      this.#reqs = reqs;
    }
    return this.#reqs;
  }

  get replies(): number[] {
    if (this.#replies === undefined) {
      const replies: number[] = [];
      for (const picks of this.#picksByKey.values()) {
        replies.push(...picks.replies);
      }
      this.#replies = replies;
    }
    return this.#replies;
  }

  get picks(): PickView {
    return PickView.wrap(this.reqs, this.replies);
  }

  /**
   * The number of steps that were needed to generate this value.
   *
   * (Some steps might use zero picks.)
   */
  get stepKeys(): StepKey[] {
    return Array.from(this.#picksByKey.keys());
  }

  /** Returns the picks for the given step, or an empty PickList if not found. */
  getPicks(key: StepKey): PickView {
    return this.#picksByKey.get(key) ?? PickView.empty;
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
    const pick = makePickFunction(playouts, { ...opts, log });

    const next = script.build(pick);
    if (next === filtered) {
      continue;
    }
    return new Gen({
      script,
      calls: log.takeLog(),
      val: next,
    }); // finished
  }
  return filtered;
}
