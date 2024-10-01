import type { Failure, Success } from "./results.ts";
import type { IntEditor, PickRequest } from "./picks.ts";
import type { PickFunction, PickSet, ThenFunction } from "./build.ts";

import { failure } from "./results.ts";
import { EditPicker, PickList, PlaybackPicker } from "./picks.ts";
import { onePlayout } from "./backtracking.ts";
import { generate, mustGenerate, thenGenerate } from "./build.ts";

const needGenerate = Symbol("needGenerate");

/**
 * A generated value and the picks that were used to generate it.
 */
export class Gen<T> implements Success<T> {
  readonly #set: PickSet<T>;
  readonly #input: Gen<unknown> | undefined;

  /** The requests for the last build step. */
  readonly #lastReqs: PickRequest[];

  /** The replies for the last build step. */
  readonly #lastReplies: number[];

  #val: T | typeof needGenerate;
  #reqs: PickRequest[] | undefined;
  #replies: number[] | undefined;

  /**
   * Creates a generated value with the given contents.
   *
   * This constructor should not normally be called directly. Instead, use
   * the {@link generate} method or a {@link Domain}.
   */
  private constructor(
    set: PickSet<T>,
    input: Gen<unknown> | undefined,
    stepReqs: PickRequest[],
    stepReplies: number[],
    val: T,
  ) {
    this.#set = set;
    this.#input = input;
    this.#lastReqs = stepReqs;
    this.#lastReplies = stepReplies;
    this.#val = val;
  }

  /** Satisfies the Success interface. */
  get ok(): true {
    return true;
  }

  get label(): string {
    return this.#set.label;
  }

  get reqs(): PickRequest[] {
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
   * The picks that were used to generate this value, divided up by build step
   */
  get splitPicks(): PickList[] {
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
    if (this.#val === needGenerate) {
      return mustGenerate(this.#set, this.replies);
    }
    const val = this.#val;
    if (!Object.isFrozen(val)) {
      this.#val = needGenerate;
    }
    return val;
  }

  /**
   * Regenerates the value after editing its picks.
   * @returns the new value, or undefined if no change is available.
   */
  mutate(edit: IntEditor): Gen<T> | undefined {
    const picker = new EditPicker(this.replies, edit);
    const gen = generate(this.#set, onePlayout(picker));
    if (picker.edits === 0 && picker.deletes === 0) {
      return undefined; // no change
    }
    return gen;
  }

  thenBuild<Out>(
    then: ThenFunction<T, Out>,
    replies: number[],
  ): Gen<Out> | Failure {
    const picker = new PlaybackPicker(replies);
    const gen = thenGenerate(this, then, onePlayout(picker));
    if (gen === undefined || picker.error) {
      const err = picker.error ?? "picks not accepted";
      return failure(`build step failed: ${err}`);
    }
    return gen;
  }

  thenMustBuild<Out>(
    then: ThenFunction<T, Out>,
    replies: number[],
  ): Gen<Out> {
    const gen = this.thenBuild(then, replies);
    if (!gen.ok) {
      throw new Error(gen.message);
    }
    return gen;
  }

  static fromBuildResult<T>(
    set: PickSet<T>,
    reqs: PickRequest[],
    replies: number[],
    val: T,
  ): Gen<T> {
    return new Gen(set, undefined, reqs, replies, val);
  }

  static fromStepResult<In, T>(
    label: string,
    input: Gen<In>,
    then: ThenFunction<In, T>,
    stepReqs: PickRequest[],
    stepReplies: number[],
    val: T,
  ): Gen<T> {
    const set = {
      label,
      buildScript: (pick: PickFunction) => then(input.val, pick),
    };
    return new Gen(set, input, stepReqs, stepReplies, val);
  }

  static build<T>(set: PickSet<T>, replies: number[]): Gen<T> | Failure {
    const picker = new PlaybackPicker(replies);
    const gen = generate(set, onePlayout(picker));
    if (gen === undefined || picker.error !== undefined) {
      const err = picker.error ?? "picks not accepted";
      return failure(`can't build '${set.label}': ${err}`);
    }
    return gen;
  }

  static mustBuild<T>(set: PickSet<T>, replies: number[]): Gen<T> {
    const gen = Gen.build(set, replies);
    if (!gen.ok) {
      throw new Error(gen.message);
    }
    return gen;
  }

  static steps(last: Gen<unknown>): Gen<unknown>[] {
    const steps = [last];
    for (let step = last.#input; step !== undefined; step = step.#input) {
      steps.push(step);
    }
    steps.reverse();
    return steps;
  }
}
