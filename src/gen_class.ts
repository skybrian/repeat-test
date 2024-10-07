import type { Failure, Success } from "./results.ts";
import type { Pickable } from "./pickable.ts";
import type { ThenFunction } from "./script_class.ts";
import type { PickRequest } from "./picks.ts";
import type { SegmentEditor, StreamEditor } from "./edits.ts";

import { assert } from "@std/assert";
import { failure } from "./results.ts";
import { Script } from "./script_class.ts";
import { PickList, PlaybackPicker } from "./picks.ts";
import { EditPicker, keep } from "./edits.ts";
import { onePlayout } from "./backtracking.ts";
import { generate, makePickFunction, thenGenerate } from "./build.ts";

const alwaysGenerate = Symbol("alwaysGenerate");

export type PipeRequest<I, T> = {
  script: Script<T>;
  input: Gen<I>;
  then: ThenFunction<I, T>;
};

class PipeResult<I, T> {
  constructor(readonly request: PipeRequest<I, T>, readonly output: Gen<T>) {}
  get input(): Gen<I> {
    return this.request.input;
  }
}

/**
 * A generated value and the picks that were used to generate it.
 */
export class Gen<T> implements Success<T> {
  readonly #script: Script<T>;
  readonly #pipeResult: PipeResult<unknown, T> | undefined;

  /** The requests for the last build step. */
  readonly #lastReqs: PickRequest[];

  /** The replies for the last build step. */
  readonly #lastReplies: number[];

  #val: T | typeof alwaysGenerate;
  #reqs: PickRequest[] | undefined;
  #replies: number[] | undefined;

  /**
   * Creates a generated value with the given contents.
   *
   * This constructor should not normally be called directly. Instead, use
   * the {@link generate} method or a {@link Domain}.
   */
  private constructor(
    script: Script<T>,
    pipeReq: PipeRequest<unknown, T> | undefined,
    lastReqs: PickRequest[],
    lastReplies: number[],
    val: T,
  ) {
    this.#script = script;
    this.#pipeResult = pipeReq === undefined
      ? undefined
      : new PipeResult(pipeReq, this);
    this.#lastReqs = lastReqs;
    this.#lastReplies = lastReplies;
    this.#val = val;
  }

  /** Satisfies the Success interface. */
  get ok(): true {
    return true;
  }

  get name(): string {
    return this.#script.name;
  }

  private get reqs(): PickRequest[] {
    if (this.#reqs === undefined) {
      const reqs: PickRequest[] = [];
      for (const step of this.getPipeline()) {
        reqs.push(...step.input.#lastReqs);
      }
      reqs.push(...this.#lastReqs);
      this.#reqs = reqs;
    }
    return this.#reqs;
  }

  get replies(): number[] {
    if (this.#replies === undefined) {
      const replies: number[] = [];
      for (const step of this.getPipeline()) {
        replies.push(...step.input.#lastReplies);
      }
      replies.push(...this.#lastReplies);
      this.#replies = replies;
    }
    return this.#replies;
  }

  get picks(): PickList {
    return new PickList(this.reqs, this.replies);
  }

  /**
   * The number of segments that were needed to generate this value.
   *
   * (Includes empty segments.)
   */
  get segmentCount(): number {
    if (this.#pipeResult === undefined) {
      // base case: no pipe
      return 1;
    }
    return this.#pipeResult.input.segmentCount + 1;
  }

  /**
   * The picks that were used to generate this value, divided up by the segment
   * that used them.
   */
  get segmentPicks(): PickList[] {
    const segments: PickList[] = [];
    for (const step of this.getPipeline()) {
      const gen = step.input;
      segments.push(new PickList(gen.#lastReqs, gen.#lastReplies));
    }
    segments.push(new PickList(this.#lastReqs, this.#lastReplies));
    return segments;
  }

  /**
   * Returns the value that was generated.
   *
   * If not a frozen value, accessing this property will generate a new clone
   * each time after the first access.
   */
  get val(): T {
    if (this.#val !== alwaysGenerate) {
      const val = this.#val;
      if (!Object.isFrozen(val)) {
        // Regenerate the value from now on.
        this.#val = alwaysGenerate;
      }
      return val;
    }

    const pipe = this.#script.toPipe();
    if (pipe === undefined) {
      const playouts = onePlayout(new PlaybackPicker(this.replies));
      assert(playouts.startAt(0));
      const pick = makePickFunction(playouts);
      return this.#script.buildPick(pick);
    }

    // Recursive case: get the previous input (perhaps also regenerated) and
    // rerun the last step.
    assert(this.#pipeResult !== undefined);
    const input = this.#pipeResult.input.val;
    const playouts = onePlayout(new PlaybackPicker(this.#lastReplies));
    assert(playouts.startAt(0));
    const pick = makePickFunction(playouts);
    return pipe.then(input, pick);
  }

  /**
   * Regenerates the value after editing its picks.
   *
   * Returns the new value, which might be the same one (according to ===) if
   * there is no change.
   *
   * If edit can't be applied, returns undefined.
   */
  mutate(editors: SegmentEditor): Gen<T> | undefined {
    const steps = this.getPipeline();
    if (steps.length === 0) {
      return this.mutateNonPipe(editors(0));
    }

    let i = 0;
    const next = steps[0].input.mutateNonPipe(editors(i++));
    if (next === undefined) {
      return undefined; // failed edit
    }
    let gen = next;
    for (const step of steps) {
      const editor = editors(i++);
      if (editor === keep && gen === step.input) {
        gen = step.output; // no change
        continue;
      }

      const picks = new EditPicker(step.output.#lastReplies, editor);
      const playouts = onePlayout(picks);
      const pick = makePickFunction(playouts);
      const pipeReq = {
        script: step.request.script,
        input: gen,
        then: step.request.then,
      };
      const next = thenGenerate(pipeReq, pick, playouts);
      if (next === undefined) {
        return undefined; // failed edit
      }
      if (
        gen === step.input && picks.edits === 0 &&
        picks.deletes === 0
      ) {
        gen = step.output; // no change
      } else {
        gen = next;
      }
    }
    return gen as Gen<T>;
  }

  private mutateNonPipe(editor: StreamEditor): Gen<T> | undefined {
    if (editor === keep) {
      return this; // no change (performance optimization)
    }

    const picker = new EditPicker(this.replies, editor);
    const gen = generate(this.#script, onePlayout(picker));
    if (gen === undefined) {
      return undefined; // failed edit
    }

    if (picker.edits === 0 && picker.deletes === 0) {
      return this; // no change
    }

    return gen;
  }

  /**
   * The pipeline steps that were used to generate this value.
   *
   * Returns an empty array if not a pipeline.
   */
  private getPipeline(): PipeResult<unknown, unknown>[] {
    const steps = [];
    const lastResult = this.#pipeResult as
      | PipeResult<unknown, unknown>
      | undefined;
    for (
      let res = lastResult;
      res !== undefined;
      res = res.input.#pipeResult
    ) {
      steps.push(res);
    }
    steps.reverse();
    return steps;
  }

  static makeBuildResult<T>(
    script: Script<T>,
    reqs: PickRequest[],
    replies: number[],
    val: T,
  ): Gen<T> {
    assert(script.toPipe() === undefined);
    return new Gen(script, undefined, reqs, replies, val);
  }

  static makePipeResult<In, T>(
    request: PipeRequest<In, T>,
    thenReqs: PickRequest[],
    thenReplies: number[],
    val: T,
  ): Gen<T> {
    assert(request.script.toPipe()?.then === request.then);
    return new Gen(
      request.script,
      request as PipeRequest<unknown, T>,
      thenReqs,
      thenReplies,
      val,
    );
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

  static mustBuild<T>(arg: Pickable<T>, replies: number[]): Gen<T> {
    const gen = Gen.build(arg, replies);
    if (!gen.ok) {
      throw new Error(gen.message);
    }
    return gen;
  }
}
