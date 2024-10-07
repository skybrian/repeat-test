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

class PipeHead<T> {
  readonly #script: Script<T>;
  readonly #output: Gen<T>;

  constructor(
    script: Script<T>,
    readonly reqs: PickRequest[],
    readonly replies: number[],
    output: Gen<T>,
  ) {
    this.#script = script;
    this.#output = output;
  }

  get segmentCount(): number {
    return 1;
  }

  get picks(): PickList {
    return new PickList(this.reqs, this.replies);
  }

  regenerate(): T {
    const playouts = onePlayout(new PlaybackPicker(this.replies));
    assert(playouts.startAt(0));
    const pick = makePickFunction(playouts);
    return this.#script.buildPick(pick);
  }

  mutateStream(editor: StreamEditor): Gen<T> | undefined {
    if (editor === keep) {
      return this.#output; // no change (performance optimization)
    }

    const picker = new EditPicker(this.replies, editor);
    const gen = generate(this.#script, onePlayout(picker));
    if (gen === undefined) {
      return undefined; // failed edit
    }

    if (picker.edits === 0 && picker.deletes === 0) {
      return this.#output; // no change
    }

    return gen;
  }
}

class PipeStep<I, T> {
  readonly index: number;
  readonly #output: Gen<T>;

  constructor(
    readonly request: PipeRequest<I, T>,
    readonly source: PipeHead<I> | PipeStep<unknown, I>,
    readonly reqs: PickRequest[],
    readonly replies: number[],
    output: Gen<T>,
  ) {
    this.index = this.input.segmentCount;
    this.#output = output;
  }

  get input(): Gen<I> {
    return this.request.input;
  }

  get segmentCount(): number {
    return this.index + 1;
  }

  get picks(): PickList {
    return new PickList(this.reqs, this.replies);
  }

  regenerate(): T {
    const input = this.input.val;
    const playouts = onePlayout(new PlaybackPicker(this.replies));
    assert(playouts.startAt(0));
    const pick = makePickFunction(playouts);
    return this.request.then(input, pick);
  }

  mutate(input: Gen<I>, editor: StreamEditor): Gen<T> | undefined {
    if (editor === keep && input === this.input) {
      return this.#output; // no change
    }

    const picks = new EditPicker(this.replies, editor);
    const playouts = onePlayout(picks);
    const pick = makePickFunction(playouts);
    const pipeReq = {
      script: this.request.script,
      input,
      then: this.request.then,
    };
    const next = thenGenerate(pipeReq, pick, playouts);
    if (next === undefined) {
      return undefined; // failed edit
    } else if (
      input === this.input && picks.edits === 0 &&
      picks.deletes === 0
    ) {
      return this.#output; // no change
    } else {
      return next;
    }
  }
}

/**
 * Given the end of a pipeline, returns all the components.
 */
function splitPipeline<T>(
  end: PipeHead<T> | PipeStep<unknown, T>,
): { first: PipeHead<unknown>; rest: PipeStep<unknown, unknown>[] } {
  let source: PipeStep<unknown, unknown> | PipeHead<unknown> = end;

  const rest = [];
  while (source instanceof PipeStep) {
    rest.push(source);
    source = source.source;
  }
  return { first: source, rest };
}

/**
 * A generated value and the picks that were used to generate it.
 */
export class Gen<T> implements Success<T> {
  readonly #script: Script<T>;
  readonly #pipe: PipeHead<T> | PipeStep<unknown, T>;

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
    this.#pipe = pipeReq === undefined
      ? new PipeHead(this.#script, lastReqs, lastReplies, this)
      : new PipeStep(
        pipeReq,
        pipeReq.input.#pipe,
        lastReqs,
        lastReplies,
        this,
      );
    this.#reqs = pipeReq === undefined ? lastReqs : undefined;
    this.#replies = pipeReq === undefined ? lastReplies : undefined;
    this.#val = val;
  }

  /** Satisfies the Success interface. */
  get ok(): true {
    return true;
  }

  get name(): string {
    return this.#script.name;
  }

  get reqs(): PickRequest[] {
    if (this.#reqs === undefined) {
      const { first, rest } = splitPipeline(this.#pipe);
      const reqs: PickRequest[] = [...first.reqs];
      for (const step of rest) {
        reqs.push(...step.reqs);
      }
      this.#reqs = reqs;
    }
    return this.#reqs;
  }

  get replies(): number[] {
    if (this.#replies === undefined) {
      const { first, rest } = splitPipeline(this.#pipe);
      const replies: number[] = [...first.replies];
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
   * The number of segments that were needed to generate this value.
   *
   * (Includes empty segments.)
   */
  get segmentCount(): number {
    return this.#pipe.segmentCount;
  }

  /**
   * The picks that were used to generate this value, divided up by the segment
   * that used them.
   */
  get segmentPicks(): PickList[] {
    const { first, rest } = splitPipeline(this.#pipe);
    const segments: PickList[] = [first.picks];
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
    if (this.#val !== alwaysGenerate) {
      const val = this.#val;
      if (!Object.isFrozen(val)) {
        // Regenerate the value from now on.
        this.#val = alwaysGenerate;
      }
      return val;
    }

    return this.#pipe.regenerate();
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
    const { first, rest } = splitPipeline(this.#pipe);

    let i = 0;
    const next = first.mutateStream(editors(i++));
    if (next === undefined) {
      return undefined; // failed edit
    }
    let input = next;
    for (const step of rest) {
      const next = step.mutate(input, editors(i++));
      if (next === undefined) {
        return undefined; // failed edit
      }
      input = next;
    }
    return input as Gen<T>;
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
