import type { Failure, Success } from "./results.ts";
import type { Pickable, PickFunction } from "./pickable.ts";
import type { Done, Paused } from "./script_class.ts";
import type { Range } from "./picks.ts";
import type { StepEditor, StepKey, StreamEditor } from "./edits.ts";
import type { GenerateOpts } from "./build.ts";
import type { PlayoutSource } from "./backtracking.ts";

import { assert } from "@std/assert";
import { failure, filtered } from "./results.ts";
import { cacheOnce, Script } from "./script_class.ts";
import { PickList, PlaybackPicker } from "./picks.ts";
import { EditedPickSource, keep } from "./edits.ts";
import { onePlayout } from "./backtracking.ts";
import { makePickFunction, usePicks } from "./build.ts";
import { minPlayout } from "./backtracking.ts";

type PipeResult<T> = Paused<T> | Done<T>;

/**
 * Rebuilds a {@link PipeResult} when it's mutable according to Object.isFrozen.
 */
function cache<T>(
  result: PipeResult<T>,
  build: () => PipeResult<T>,
): PipeResult<T> {
  if (!result.done || Object.isFrozen(result.val)) {
    return result; // assumed immutable
  }
  return cacheOnce(result.val, () => {
    const val = build();
    assert(val.done);
    return val.val;
  });
}

class PipeStart<T> {
  readonly result: PipeResult<T>;

  constructor(script: Script<T>) {
    this.result = script.paused;
  }
}

class PipeStep<T> {
  readonly key: StepKey;
  readonly result: PipeResult<T>;

  constructor(
    readonly source: PipeStart<T> | PipeStep<T>,
    readonly reqs: Range[],
    readonly replies: number[],
    output: PipeResult<T>,
  ) {
    const paused = source.result;
    assert(!paused.done);
    this.key = paused.key;

    const regenerate = (): PipeResult<T> => {
      const pick = usePicks(...this.replies);
      const result = paused.step(pick);
      assert(
        result !== filtered,
        "nondeterministic step (wasn't filtered before)",
      );
      return result;
    };

    this.result = cache(output, regenerate);
  }

  get picks(): PickList {
    return new PickList(this.reqs, this.replies);
  }

  mutate(
    nextSource: PipeStart<T> | PipeStep<T>,
    editor: StreamEditor,
  ): PipeStep<T> | Done<T> | typeof filtered {
    if (editor === keep && nextSource === this.source) {
      return this; // no change
    }

    const paused = nextSource.result;
    if (paused.done) {
      return paused; // finished early
    }

    const picks = new EditedPickSource(this.replies, editor);
    const next = paused.step(makePickFunction(picks));
    if (next === filtered) {
      return filtered;
    }

    if (nextSource === this.source && !picks.edited) {
      return this; // no change
    }

    return new PipeStep(nextSource, picks.reqs, picks.replies, next);
  }

  static generateStep<T>(
    source: PipeStart<T> | PipeStep<T>,
    pick: PickFunction,
    playouts: PlayoutSource,
  ): PipeStep<T> | Done<T> | typeof filtered {
    const paused = source.result;
    if (paused.done) {
      return paused;
    }

    const depth = playouts.depth;
    while (playouts.startValue(depth)) {
      const next = paused.step(pick);
      if (next === filtered) {
        if (playouts.state === "picking") {
          playouts.endPlayout();
        }
        continue;
      }
      const reqs = playouts.getRequests(depth);
      const replies = playouts.getReplies(depth);
      return new PipeStep(source, reqs, replies, next);
    }

    return filtered; // no playouts matched at this depth
  }
}

/**
 * Given the end of a pipeline, returns all the components.
 */
function splitPipeline<T>(
  end: PipeStart<T> | PipeStep<T>,
): { first: PipeStart<T>; rest: PipeStep<T>[] } {
  let source: PipeStep<T> | PipeStart<T> = end;

  const rest = [];
  while (source instanceof PipeStep) {
    rest.push(source);
    source = source.source;
  }
  rest.reverse();
  return { first: source, rest: rest };
}

/**
 * A generated value and the picks that were used to generate it.
 */
export class Gen<T> implements Success<T> {
  readonly #script: Script<T>;
  readonly #end: PipeStart<T> | PipeStep<T>;
  readonly #result: Done<T>;

  #steps: Map<StepKey, PipeStep<T>> | undefined;
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
    end: PipeStart<T> | PipeStep<T>,
  ) {
    this.#script = script;
    this.#end = end;
    assert(end.result.done);
    this.#result = end.result;
  }

  /** Satisfies the Success interface. */
  get ok(): true {
    return true;
  }

  get name(): string {
    return this.#script.name;
  }

  get reqs(): Range[] {
    if (this.#reqs === undefined) {
      const reqs: Range[] = [];
      for (const step of this.stepsWithPicks.values()) {
        reqs.push(...step.reqs);
      }
      this.#reqs = reqs;
    }
    return this.#reqs;
  }

  get replies(): number[] {
    if (this.#replies === undefined) {
      const replies: number[] = [];
      for (const step of this.stepsWithPicks.values()) {
        replies.push(...step.replies);
      }
      this.#replies = replies;
    }
    return this.#replies;
  }

  get picks(): PickList {
    return new PickList(this.reqs, this.replies);
  }

  /**
   * The number of steps that were needed to generate this value.
   *
   * (Some steps might use zero picks.)
   */
  get stepKeys(): StepKey[] {
    return Array.from(this.stepsWithPicks.keys());
  }

  /** Returns the picks for the given step, or an empty PickList if not found. */
  getPicks(key: StepKey): PickList {
    const step = this.stepsWithPicks.get(key);
    if (step === undefined) {
      return PickList.empty;
    }
    return step.picks;
  }

  /**
   * Returns the value that was generated.
   *
   * If not a frozen value, accessing this property will generate a new clone
   * each time after the first access.
   */
  get val(): T {
    return this.#result.val;
  }

  /**
   * Returns an edited value if the edit worked and it passes the test.
   *
   * If the edit had no effect, returns this.
   */
  tryMutate(
    editor: StepEditor,
    test: (val: T) => boolean,
  ): Gen<T> | typeof filtered {
    const next = this.mutate(editor);
    if (next === filtered) {
      return filtered;
    }
    if (next !== this && !test(next.val)) {
      return filtered;
    }
    return next;
  }

  /**
   * Regenerates the value after editing its picks.
   *
   * Returns the new value, which might be the same one (according to ===) if
   * there is no change.
   *
   * If edit can't be applied, returns {@link filtered}.
   */
  mutate(editors: StepEditor): Gen<T> | typeof filtered {
    const { first, rest } = splitPipeline(this.#end);

    let i = 0;
    let end: PipeStart<T> | PipeStep<T> = first;
    for (const step of rest) {
      const next = step.mutate(end, editors(i++));
      if (next === filtered) {
        return filtered; // failed edit
      } else if (!(next instanceof PipeStep)) {
        return new Gen(this.#script, end); // finished earlier than before
      }
      end = next;
    }
    if (end === this.#end) {
      return this; // no change
    }

    if (end.result.done) {
      return new Gen(this.#script, end); // finished in the same number of steps.
    }

    // Pipeline is longer. Keep building with default picks.
    const playout = minPlayout();
    const pick = makePickFunction(playout);

    while (!end.result.done) {
      const next = PipeStep.generateStep(
        end,
        pick,
        playout,
      );
      if (next === filtered) {
        return filtered; // failed edit
      }
      assert(next instanceof PipeStep);
      end = next;
    }

    return new Gen(this.#script, end);
  }

  private get stepsWithPicks(): Map<StepKey, PipeStep<T>> {
    if (this.#steps === undefined) {
      const { rest } = splitPipeline(this.#end);
      const steps = new Map<StepKey, PipeStep<T>>();
      for (const step of rest) {
        if (step.reqs.length > 0) {
          steps.set(step.key, step);
        }
      }
      this.#steps = steps;
    }
    return this.#steps;
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

  nextPlayout: while (playouts.startAt(0)) {
    let source: PipeStart<T> | PipeStep<T> = new PipeStart(script);
    while (true) {
      const next: PipeStep<T> | Done<T> | typeof filtered = PipeStep
        .generateStep(
          source,
          pick,
          playouts,
        );
      if (next === filtered) {
        continue nextPlayout;
      } else if (!(next instanceof PipeStep)) {
        return new Gen(script, source); // finished
      }
      source = next;
    }
  }
  return filtered;
}
