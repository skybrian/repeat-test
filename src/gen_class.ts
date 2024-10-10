import type { Done, Failure, Success } from "./results.ts";
import type { Pickable, PickFunction } from "./pickable.ts";
import type { ScriptResult } from "./script_class.ts";
import type { Range } from "./picks.ts";
import type { StepEditor, StreamEditor } from "./edits.ts";
import type { GenerateOpts } from "./build.ts";
import type { PlayoutSource } from "./backtracking.ts";

import { assert } from "@std/assert";
import { Filtered } from "./pickable.ts";
import { cacheOnce, failure } from "./results.ts";
import { Script } from "./script_class.ts";
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

class PipeHead<T> {
  readonly result: ScriptResult<T>;

  constructor(
    private readonly script: Script<T>,
    readonly reqs: Range[],
    readonly replies: number[],
    output: ScriptResult<T>,
  ) {
    this.result = cache(output, () => {
      const pick = usePicks(...this.replies);
      return this.script.step(pick);
    });
  }

  get stepCount(): number {
    return 1;
  }

  get picks(): PickList {
    return new PickList(this.reqs, this.replies);
  }

  mutate(editor: StreamEditor): PipeHead<T> | undefined {
    if (editor === keep) {
      return this; // no change (performance optimization)
    }

    const picks = new EditedPickSource(this.replies, editor);
    const next = this.script.maybeStep(makePickFunction(picks));
    if (next === undefined) {
      return undefined; // failed edit
    }

    if (!picks.edited) {
      return this; // no change
    }

    return new PipeHead(this.script, picks.reqs, picks.replies, next);
  }

  static generate<T>(
    script: Script<T>,
    pick: PickFunction,
    playouts: PlayoutSource,
  ): PipeHead<T> | undefined {
    const depth = playouts.depth;
    while (playouts.startValue(depth)) {
      try {
        const val = script.step(pick);
        const reqs = playouts.getRequests(depth);
        const replies = playouts.getReplies(depth);
        return new PipeHead(script, reqs, replies, val);
      } catch (e) {
        if (!(e instanceof Filtered)) {
          throw e;
        }
        if (playouts.state === "picking") {
          playouts.endPlayout(); // filtered, move to next playout
        }
      }
    }
    return undefined;
  }
}

class PipeStep<T> {
  private readonly index: number;
  readonly result: ScriptResult<T>;

  constructor(
    readonly source: PipeHead<T> | PipeStep<T>,
    readonly reqs: Range[],
    readonly replies: number[],
    output: ScriptResult<T>,
  ) {
    const script = source.result;
    assert(!script.done);

    this.index = this.source.stepCount;
    this.result = cache(output, () => {
      const pick = usePicks(...this.replies);
      return script.step(pick);
    });
  }

  get stepCount(): number {
    return this.index + 1;
  }

  get picks(): PickList {
    return new PickList(this.reqs, this.replies);
  }

  mutate(
    nextSource: PipeHead<T> | PipeStep<T>,
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
    const next = paused.maybeStep(makePickFunction(picks));
    if (next === undefined) {
      return undefined; // filtered
    }

    if (nextSource === this.source && !picks.edited) {
      return this; // no change
    }

    return new PipeStep(nextSource, picks.reqs, picks.replies, next);
  }

  static generateStep<T>(
    source: PipeHead<T> | PipeStep<T>,
    pick: PickFunction,
    playouts: PlayoutSource,
  ): PipeStep<T> | Success<T> | undefined {
    const paused = source.result;
    if (paused.done) {
      return paused;
    }

    const depth = playouts.depth;
    while (playouts.startValue(depth)) {
      const next = paused.maybeStep(pick);
      if (next === undefined) {
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
  end: PipeHead<T> | PipeStep<T>,
): { first: PipeHead<T>; rest: PipeStep<T>[] } {
  let source: PipeStep<T> | PipeHead<T> = end;

  const rest = [];
  while (source instanceof PipeStep) {
    rest.push(source);
    source = source.source;
  }
  rest.reverse();
  return { first: source, rest };
}

/**
 * A generated value and the picks that were used to generate it.
 */
export class Gen<T> implements Success<T> {
  readonly #name: string;
  readonly #end: PipeHead<T> | PipeStep<T>;
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
    name: string,
    end: PipeHead<T> | PipeStep<T>,
  ) {
    this.#name = name;
    this.#end = end;
    assert(end.result.done);
    this.#result = end.result;
  }

  /** Satisfies the Success interface. */
  get ok(): true {
    return true;
  }

  get name(): string {
    return this.#name;
  }

  get reqs(): Range[] {
    if (this.#reqs === undefined) {
      const { first, rest } = splitPipeline(this.#end);
      const reqs: Range[] = [...first.reqs];
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
    const next = first.mutate(editors(i++));
    if (next === undefined) {
      return undefined; // failed edit
    }
    let end: PipeHead<T> | PipeStep<T> = next;
    for (const step of rest) {
      const next = step.mutate(end, editors(i++));
      if (next === undefined) {
        return undefined; // failed edit
      } else if (!(next instanceof PipeStep)) {
        return new Gen(this.#name, end); // finished earlier than before
      }
      end = next;
    }
    if (end === this.#end) {
      return this; // no change
    }

    if (end.result.done) {
      return new Gen(this.#name, end); // finished in the same number of steps.
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

    return new Gen(this.#name, end);
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
  const start = Script.from(arg, { caller: "generate" });
  const pick = makePickFunction(playouts, opts);

  nextPlayout: while (playouts.startAt(0)) {
    const next = PipeHead.generate(start, pick, playouts);
    if (next === undefined) {
      continue;
    }

    let source: PipeHead<T> | PipeStep<T> = next;
    while (true) {
      const next: PipeStep<T> | Success<T> | undefined = PipeStep.generateStep(
        source,
        pick,
        playouts,
      );
      if (next === undefined) {
        continue nextPlayout;
      } else if (!(next instanceof PipeStep)) {
        return new Gen(start.name, source); // finished
      }
      source = next;
    }
  }
}
