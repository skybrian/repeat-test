import type { Done, Failure, Success } from "./results.ts";
import type { Pickable, PickFunction } from "./pickable.ts";
import type { ScriptResult } from "./script_class.ts";
import type { Range } from "./picks.ts";
import type { StepEditor, StreamEditor } from "./edits.ts";
import type { GenerateOpts } from "./build.ts";
import type { PlayoutSource } from "./backtracking.ts";

import { assert } from "@std/assert";
import { cacheOnce, failure } from "./results.ts";
import { filtered, Script } from "./script_class.ts";
import { PickList, PlaybackPicker } from "./picks.ts";
import { EditedPickSource, keep } from "./edits.ts";
import { onePlayout } from "./backtracking.ts";
import { makePickFunction, usePicks } from "./build.ts";
import { minPlayout } from "./backtracking.ts";

/** Rebuilds a ScriptResult when it's mutable according to Object.isFrozen. */
function cache<T>(
  result: ScriptResult<T>,
  build: () => ScriptResult<T>,
): ScriptResult<T> {
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
  readonly result: ScriptResult<T>;

  constructor(script: Script<T>) {
    this.result = script.paused;
  }

  get stepCount(): number {
    return 0;
  }
}

class PipeStep<T> {
  private readonly index: number;
  readonly result: ScriptResult<T>;

  constructor(
    readonly source: PipeStart<T> | PipeStep<T>,
    readonly reqs: Range[],
    readonly replies: number[],
    output: ScriptResult<T>,
  ) {
    const paused = source.result;
    assert(!paused.done);

    this.index = this.source.stepCount;
    this.result = cache(output, () => {
      const pick = usePicks(...this.replies);
      const result = paused.step(pick);
      assert(
        result !== filtered,
        "nondeterministic step (wasn't filtered before)",
      );
      return result;
    });
  }

  get stepCount(): number {
    return this.index + 1;
  }

  get picks(): PickList {
    return new PickList(this.reqs, this.replies);
  }

  mutate(
    nextSource: PipeStart<T> | PipeStep<T>,
    editor: StreamEditor,
  ): PipeStep<T> | Success<T> | undefined {
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
      return undefined;
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
  ): PipeStep<T> | Success<T> | undefined {
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

    return undefined; // out of playouts at this depth
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
      const { rest } = splitPipeline(this.#end);
      const reqs: Range[] = [];
      for (const step of rest) {
        reqs.push(...step.reqs);
      }
      this.#reqs = reqs;
    }
    return this.#reqs;
  }

  get replies(): number[] {
    if (this.#replies === undefined) {
      const { rest } = splitPipeline(this.#end);
      const replies: number[] = [];
      for (const step of rest) {
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
  get stepCount(): number {
    return this.#end.stepCount;
  }

  /**
   * The picks that were used to generate this value, divided up by the steps
   * that used them.
   */
  get picksByStep(): PickList[] {
    const { rest } = splitPipeline(this.#end);
    const segments: PickList[] = [];
    for (const step of rest) {
      segments.push(step.picks);
    }
    return segments;
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
   * Regenerates the value after editing its picks.
   *
   * Returns the new value, which might be the same one (according to ===) if
   * there is no change.
   *
   * If edit can't be applied, returns undefined.
   */
  mutate(editors: StepEditor): Gen<T> | undefined {
    const { first, rest } = splitPipeline(this.#end);

    let i = 0;
    let end: PipeStart<T> | PipeStep<T> = first;
    for (const step of rest) {
      const next = step.mutate(end, editors(i++));
      if (next === undefined) {
        return undefined; // failed edit
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
      if (next === undefined) {
        return undefined; // failed edit
      }
      assert(next instanceof PipeStep);
      end = next;
    }

    return new Gen(this.#script, end);
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
    if (gen === undefined || picker.error !== undefined) {
      const err = picker.error ?? "picks not accepted";
      return failure(`can't build '${script.name}': ${err}`);
    }
    return gen;
  }
}

/**
 * Generates a value at the current depth, continuing the current playout if possible.
 *
 * Returns undefined if there are no more playouts available at the current depth.
 */
export function generate<T>(
  arg: Pickable<T>,
  playouts: PlayoutSource,
  opts?: GenerateOpts,
): Gen<T> | undefined {
  const script = Script.from(arg, { caller: "generate" });
  const pick = makePickFunction(playouts, opts);

  nextPlayout: while (playouts.startAt(0)) {
    let source: PipeStart<T> | PipeStep<T> = new PipeStart(script);
    while (true) {
      const next: PipeStep<T> | Success<T> | undefined = PipeStep.generateStep(
        source,
        pick,
        playouts,
      );
      if (next === undefined) {
        continue nextPlayout;
      } else if (!(next instanceof PipeStep)) {
        return new Gen(script, source); // finished
      }
      source = next;
    }
  }
}
