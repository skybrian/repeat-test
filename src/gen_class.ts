import type { Failure, Success } from "./results.ts";
import { type Pickable, type PickFunction, Pruned } from "./pickable.ts";
import type { ThenFunction } from "./script_class.ts";
import type { PickRequest } from "./picks.ts";
import type { SegmentEditor, StreamEditor } from "./edits.ts";
import type { GenerateOpts } from "./build.ts";

import { assert } from "@std/assert";
import { failure } from "./results.ts";
import { Script } from "./script_class.ts";
import { PickList, PlaybackPicker } from "./picks.ts";
import { EditPicker, keep } from "./edits.ts";
import { onePlayout, type PlayoutSource } from "./backtracking.ts";
import { makePickFunction } from "./build.ts";

const alwaysGenerate = Symbol("alwaysGenerate");

class Cache<T> {
  #regenerate: () => T;
  #val: T | typeof alwaysGenerate;

  constructor(regenerate: () => T, val: T) {
    this.#regenerate = regenerate;
    this.#val = val;
  }

  get val(): T {
    if (this.#val !== alwaysGenerate) {
      const val = this.#val;
      if (!Object.isFrozen(val)) {
        // Regenerate the value from now on.
        this.#val = alwaysGenerate;
      }
      return val;
    }
    return this.#regenerate();
  }
}

class PipeHead<T> {
  readonly cache: Cache<T>;

  constructor(
    private readonly script: Script<T>,
    readonly reqs: PickRequest[],
    readonly replies: number[],
    output: T,
  ) {
    const regenerate = (): T => {
      const playouts = onePlayout(new PlaybackPicker(this.replies));
      assert(playouts.startAt(0));
      const pick = makePickFunction(playouts);
      return this.script.buildPick(pick);
    };
    this.cache = new Cache(regenerate, output);
  }

  get segmentCount(): number {
    return 1;
  }

  get picks(): PickList {
    return new PickList(this.reqs, this.replies);
  }

  mutate(editor: StreamEditor): PipeHead<T> | undefined {
    if (editor === keep) {
      return this; // no change (performance optimization)
    }

    const picker = new EditPicker(this.replies, editor);
    const playout = onePlayout(picker);
    const pick = makePickFunction(playout);
    const next = PipeHead.generate(
      this.script,
      pick,
      playout,
    );
    if (next === undefined) {
      return undefined; // failed edit
    }

    if (picker.edits === 0 && picker.deletes === 0) {
      return this; // no change
    }

    return next;
  }

  static generate<T>(
    script: Script<T>,
    pick: PickFunction,
    playouts: PlayoutSource,
  ): PipeHead<T> | undefined {
    const depth = playouts.depth;
    while (playouts.startValue(depth)) {
      try {
        const val = script.buildPick(pick);
        const reqs = playouts.getRequests(depth);
        const replies = playouts.getReplies(depth);
        return new PipeHead(script, reqs, replies, val);
      } catch (e) {
        if (!(e instanceof Pruned)) {
          throw e;
        }
        if (playouts.state === "picking") {
          playouts.endPlayout(); // pruned, move to next playout
        }
      }
    }
    return undefined;
  }
}

class PipeStep<I, T> {
  private readonly index: number;
  readonly #output: Cache<T>;

  constructor(
    readonly source: PipeHead<I> | PipeStep<unknown, I>,
    readonly then: ThenFunction<I, T>,
    readonly reqs: PickRequest[],
    readonly replies: number[],
    output: T,
  ) {
    this.index = this.source.segmentCount;

    const regenerate = (): T => {
      const input = this.source.cache.val;
      const playouts = onePlayout(new PlaybackPicker(this.replies));
      assert(playouts.startAt(0));
      const pick = makePickFunction(playouts);
      return then(input, pick);
    };
    this.#output = new Cache(regenerate, output);
  }

  get cache(): Cache<T> {
    return this.#output;
  }

  get segmentCount(): number {
    return this.index + 1;
  }

  get picks(): PickList {
    return new PickList(this.reqs, this.replies);
  }

  mutate(
    nextSource: PipeHead<I> | PipeStep<unknown, I>,
    editor: StreamEditor,
  ): PipeStep<I, T> | undefined {
    if (editor === keep && nextSource === this.source) {
      return this; // no change
    }

    const picks = new EditPicker(this.replies, editor);
    const playouts = onePlayout(picks);
    const pick = makePickFunction(playouts);

    const next = PipeStep.generate(
      nextSource,
      this.then,
      pick,
      playouts,
    );
    if (next === undefined) {
      return undefined; // failed edit
    }

    if (
      nextSource === this.source &&
      picks.edits === 0 && picks.deletes === 0
    ) {
      return this; // no change
    }

    return next;
  }

  static generate<I, T>(
    source: PipeHead<I> | PipeStep<unknown, I>,
    then: ThenFunction<I, T>,
    pick: PickFunction,
    playouts: PlayoutSource,
  ): PipeStep<I, T> | undefined {
    const depth = playouts.depth;
    while (playouts.startValue(depth)) {
      try {
        const val = then(source.cache.val, pick);
        const reqs = playouts.getRequests(depth);
        const replies = playouts.getReplies(depth);
        return new PipeStep(source, then, reqs, replies, val);
      } catch (e) {
        if (!(e instanceof Pruned)) {
          throw e;
        }
        if (playouts.state === "picking") {
          playouts.endPlayout(); // pruned, move to next playout
        }
      }
    }

    return undefined; // out of playouts at this depth
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
  readonly #name: string;
  readonly #end: PipeHead<T> | PipeStep<unknown, T>;
  #reqs: PickRequest[] | undefined;
  #replies: number[] | undefined;

  /**
   * Creates a generated value with the given contents.
   *
   * This constructor should not normally be called directly. Instead, use
   * the {@link generate} method or a {@link Domain}.
   */
  constructor(
    name: string,
    end: PipeHead<T> | PipeStep<unknown, T>,
  ) {
    this.#name = name;
    this.#end = end;
  }

  /** Satisfies the Success interface. */
  get ok(): true {
    return true;
  }

  get name(): string {
    return this.#name;
  }

  get reqs(): PickRequest[] {
    if (this.#reqs === undefined) {
      const { first, rest } = splitPipeline(this.#end);
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
      const { first, rest } = splitPipeline(this.#end);
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
    return this.#end.segmentCount;
  }

  /**
   * The picks that were used to generate this value, divided up by the segment
   * that used them.
   */
  get segmentPicks(): PickList[] {
    const { first, rest } = splitPipeline(this.#end);
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
    return this.#end.cache.val;
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
    const { first, rest } = splitPipeline(this.#end);

    let i = 0;
    const next = first.mutate(editors(i++));
    if (next === undefined) {
      return undefined; // failed edit
    }
    let end: PipeHead<unknown> | PipeStep<unknown, unknown> = next;
    for (const step of rest) {
      const next = step.mutate(end, editors(i++));
      if (next === undefined) {
        return undefined; // failed edit
      }
      end = next;
    }
    if (end === this.#end) {
      return this; // no change
    }
    return new Gen(this.#name, end) as Gen<T>;
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
    const gen = Gen.generate(script, onePlayout(picker));
    if (gen === undefined || picker.error !== undefined) {
      const err = picker.error ?? "picks not accepted";
      return failure(`can't build '${script.name}': ${err}`);
    }
    return gen;
  }

  /**
   * Generates a value at the current depth, continuing the current playout if possible.
   *
   * Returns undefined if there are no more playouts available at the current depth.
   */
  static generate<T>(
    script: Script<T>,
    playouts: PlayoutSource,
    opts?: GenerateOpts,
  ): Gen<T> | undefined {
    const depth = playouts.depth;
    const pick = makePickFunction(playouts, opts);
    const { base, steps } = script.toSteps();

    nextPlayout: while (playouts.startValue(depth)) {
      const first = PipeHead.generate(base, pick, playouts);
      if (first === undefined) {
        continue;
      }

      let source: PipeHead<unknown> | PipeStep<unknown, unknown> = first;
      for (const script of steps) {
        const pipe = script.toPipe();
        assert(pipe !== undefined);
        const then = pipe.then as ThenFunction<unknown, T>;
        const next: PipeStep<unknown, unknown> | undefined = PipeStep.generate(
          source,
          then,
          pick,
          playouts,
        );
        if (next === undefined) {
          continue nextPlayout;
        }
        source = next;
      }

      return new Gen<unknown>(script.name, source) as Gen<T>;
    }
  }
}
