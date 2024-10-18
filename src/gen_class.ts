import type { Failure, Success } from "./results.ts";
import type { Pickable, PickFunction } from "./pickable.ts";
import type { Range } from "./picks.ts";
import type { StepEditor, StepKey } from "./edits.ts";
import type { GenerateOpts } from "./build.ts";
import type { PlayoutSource } from "./backtracking.ts";

import { assert } from "@std/assert";
import { failure, filtered } from "./results.ts";
import { Script } from "./script_class.ts";
import { PickLog, PickView, PlaybackPicker } from "./picks.ts";
import { keep, PickEditor } from "./edits.ts";
import { onePlayout } from "./backtracking.ts";
import { makePickFunction, usePicks } from "./build.ts";

type Props<T> = {
  readonly script: Script<T>;
  readonly picks: PickView;
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
  const { script, picks, val } = props;
  if (Object.isFrozen(props.val)) {
    return () => val;
  }

  const lastReplies = picks.replies;
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
  log: PickLog,
): Props<T> | typeof filtered {
  const { script, picks } = props;

  const before = picks;
  const editor = editors(0);

  if (editor !== keep) {
    const picks = new PickEditor(before.replies, editor, log);
    const next = script.build(makePickFunction(picks));
    if (next === filtered) {
      log.cancelView();
      return filtered; // failed edit
    } else if (picks.edited) {
      return {
        script,
        picks: log.takeView(),
        val: next,
      };
    }
    log.cancelView();
  }

  // no change
  return props;
}

export class MutableGen<T> {
  #props: Props<T>;
  #log = new PickLog();
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
    const next = mutateImpl(this.#props, editor, this.#log);
    if (next === filtered) {
      this.#log.reset();
      return false; // edits didn't apply
    }

    if (next === this.#props) {
      this.#log.reset();
      return true; // edits applied, but had no effect
    }

    const cache = cacheResult(next);
    if (test && !test(cache())) {
      this.#log.reset();
      return false; // didn't pass the test
    }

    this.#props = next;
    this.#log = new PickLog();
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
    this.#picksByKey.set(0, props.picks);
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

/**
 * Generates a value from a source of playouts.
 *
 * Returns {@link filtered} if no playout was accepted.
 */
export function generate<T>(
  arg: Pickable<T>,
  playouts: PlayoutSource,
  opts?: GenerateOpts,
): Gen<T> | typeof filtered {
  const script = Script.from(arg, { caller: "generate" });
  const pick = makePickFunction(playouts, opts);

  while (playouts.startAt(0)) {
    const next = generateStep(
      script,
      pick,
      playouts,
    );
    if (next === filtered) {
      continue;
    }
    return new Gen({
      script,
      picks: next.picks,
      val: next.val,
    }); // finished
  }
  return filtered;
}

type GenStep<T> = { picks: PickView; val: T };

function generateStep<T>(
  start: Script<T>,
  pick: PickFunction,
  playouts: PlayoutSource,
):
  | GenStep<T>
  | typeof filtered {
  const depth = playouts.depth;
  while (playouts.startValue(depth)) {
    const val = start.build(pick);
    if (val === filtered) {
      if (playouts.state === "picking") {
        playouts.endPlayout();
      }
      continue;
    }
    const reqs = playouts.getRequests(depth);
    const replies = playouts.getReplies(depth);
    const picks = PickView.wrap(reqs, replies);
    return { picks, val };
  }

  return filtered; // no playouts matched at this depth
}
