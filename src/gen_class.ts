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

export type GenPipe<I, T> = {
  input: Gen<I>;
  then: ThenFunction<I, T>;
};

/**
 * A generated value and the picks that were used to generate it.
 */
export class Gen<T> implements Success<T> {
  readonly #script: Script<T>;
  readonly #pipe: GenPipe<unknown, T> | undefined;

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
    pipe: GenPipe<unknown, T> | undefined,
    lastReqs: PickRequest[],
    lastReplies: number[],
    val: T,
  ) {
    this.#script = script;
    this.#pipe = pipe;
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
      const steps = Gen.steps(this);
      this.#reqs = steps.flatMap((step) => step.#lastReqs);
    }
    return this.#reqs;
  }

  get replies(): number[] {
    if (this.#replies === undefined) {
      const steps = Gen.steps(this);
      this.#replies = steps.flatMap((step) => step.#lastReplies);
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
    if (this.#pipe === undefined) {
      // base case: no pipe
      return 1;
    }
    return this.#pipe.input.segmentCount + 1;
  }

  /**
   * The picks that were used to generate this value, divided up by the segment
   * that used them.
   */
  get segmentPicks(): PickList[] {
    const steps = Gen.steps(this);
    return steps.map((step) => new PickList(step.#lastReqs, step.#lastReplies));
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
    assert(this.#pipe !== undefined);
    const input = this.#pipe.input.val;
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
  mutate(editor: SegmentEditor): Gen<T> | undefined {
    if (this.#pipe === undefined) {
      return this.mutateNonPipe(editor(0)); // base case: no pipe
    }

    const input = this.#pipe.input.mutate(editor);
    if (input === undefined) {
      return undefined; // failed edit
    }

    const indexBefore = this.segmentCount - 1;
    const picks = new EditPicker(this.#lastReplies, editor(indexBefore));
    const playouts = onePlayout(picks);
    const pick = makePickFunction(playouts);
    const gen = thenGenerate(
      this.#script,
      { input, then: this.#pipe.then },
      pick,
      playouts,
    );

    if (gen === undefined) {
      return undefined; // failed edit
    } else if (
      input === this.#pipe.input && picks.edits === 0 && picks.deletes === 0
    ) {
      return this; // no change
    }

    return gen;
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

  static fromBuildResult<T>(
    script: Script<T>,
    reqs: PickRequest[],
    replies: number[],
    val: T,
  ): Gen<T> {
    assert(script.toPipe() === undefined);
    return new Gen(script, undefined, reqs, replies, val);
  }

  static fromPipeResult<In, T>(
    script: Script<T>,
    pipe: GenPipe<In, T>,
    thenReqs: PickRequest[],
    thenReplies: number[],
    val: T,
  ): Gen<T> {
    assert(script.toPipe() !== undefined);
    return new Gen(
      script,
      pipe as GenPipe<unknown, T>,
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

  static steps(last: Gen<unknown>): Gen<unknown>[] {
    const steps = [last];
    for (
      let step = last.#pipe?.input;
      step !== undefined;
      step = step.#pipe?.input
    ) {
      steps.push(step);
    }
    steps.reverse();
    return steps;
  }
}
