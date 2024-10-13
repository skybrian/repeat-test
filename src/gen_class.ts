import type { Failure, Success } from "./results.ts";
import type { Pickable, PickFunction } from "./pickable.ts";
import type { Done, Paused } from "./script_class.ts";
import type { PickLog, Range } from "./picks.ts";
import type { StepEditor, StepKey } from "./edits.ts";
import type { GenerateOpts } from "./build.ts";
import type { PlayoutSource } from "./backtracking.ts";

import { assert } from "@std/assert";
import { failure, filtered } from "./results.ts";
import { cacheOnce, Script } from "./script_class.ts";
import { PickView, PlaybackPicker } from "./picks.ts";
import { EditedPickSource, keep } from "./edits.ts";
import { onePlayout } from "./backtracking.ts";
import { makePickFunction, usePicks } from "./build.ts";
import { minPlayout } from "./backtracking.ts";

type PipeStep<T> = {
  readonly start: Paused<T>;
  readonly picks: PickView;
};

/**
 * A generated value and the picks that were used to generate it.
 */
export class Gen<T> implements Success<T> {
  readonly #script: Script<T>;
  readonly #result: Done<T>;

  #steps: PipeStep<T>[];
  #stepsByKey: Map<StepKey, PipeStep<T>> | undefined;
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
    steps: PipeStep<T>[],
    result: Done<T>,
  ) {
    this.#script = script;
    this.#steps = steps;

    if (steps.length === 0 || Object.isFrozen(result.val)) {
      this.#result = result;
      return;
    }

    const paused = steps[steps.length - 1].start;
    const regenerate = (): T => {
      const pick = usePicks(...this.picks.replies);
      const result = paused.step(pick);
      assert(
        result !== filtered && result.done,
        "can't regenerate value of nondeterministic step",
      );
      return result.val;
    };

    this.#result = cacheOnce(result.val, regenerate);
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
        reqs.push(...step.picks.reqs);
      }
      this.#reqs = reqs;
    }
    return this.#reqs;
  }

  get replies(): number[] {
    if (this.#replies === undefined) {
      const replies: number[] = [];
      for (const step of this.stepsWithPicks.values()) {
        replies.push(...step.picks.replies);
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
    return Array.from(this.stepsWithPicks.keys());
  }

  /** Returns the picks for the given step, or an empty PickList if not found. */
  getPicks(key: StepKey): PickView {
    const step = this.stepsWithPicks.get(key);
    if (step === undefined) {
      return PickView.empty;
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
   *
   * Picks from changed steps are allocated at the end of the log.
   */
  tryMutate(
    editor: StepEditor,
    test: (val: T) => boolean,
    log: PickLog,
  ): Gen<T> | typeof filtered {
    const next = this.mutate(editor, log);
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
   *
   * Picks from changed steps are allocated at the end of the log.
   */
  mutate(editors: StepEditor, log: PickLog): Gen<T> | typeof filtered {
    const rest = this.#steps;
    if (rest.length === 0) {
      return this; // no change
    }

    const newSteps: PipeStep<T>[] = [];

    let state = this.#script.paused;

    let editedBefore = false;
    for (let i = 0; i < rest.length; i++) {
      const step = rest[i];
      const editor = editors(step.start.key);

      if (editor === keep && !editedBefore) {
        // no change
        if (i === rest.length - 1) {
          return this;
        }
        newSteps.push(step);
        state = rest[i + 1].start;
        continue;
      }

      if (state.done) {
        return new Gen(this.#script, newSteps, state); // finished earlier than before
      }

      const picks = new EditedPickSource(step.picks.replies, editor, log);
      const next = state.step(makePickFunction(picks));
      if (next === filtered) {
        log.cancelView();
        return filtered; // failed edit
      }

      if (!picks.edited && !editedBefore) {
        // no change
        if (i === rest.length - 1) {
          return this;
        }
        log.cancelView();
        newSteps.push(step);
        state = rest[i + 1].start;
        continue;
      }

      editedBefore = true;
      newSteps.push({ start: state, picks: log.takeView() });
      state = next;
    }

    if (state.done) {
      return new Gen(this.#script, newSteps, state); // finished in the same number of steps.
    }

    // Pipeline is longer. Keep building with default picks.
    const playout = minPlayout();
    const pick = makePickFunction(playout);

    while (!state.done) {
      const next: GenStep<T> | typeof filtered = generateStep(
        state,
        pick,
        playout,
      );
      if (next === filtered) {
        return filtered; // failed edit
      }
      newSteps.push({ start: state, picks: next.picks });
      state = next.result;
    }

    return new Gen(this.#script, newSteps, state);
  }

  private get stepsWithPicks(): Map<StepKey, PipeStep<T>> {
    if (this.#stepsByKey === undefined) {
      const steps = new Map<StepKey, PipeStep<T>>();
      for (const step of this.#steps) {
        if (step.picks.reqs.length > 0) {
          steps.set(step.start.key, step);
        }
      }
      this.#stepsByKey = steps;
    }
    return this.#stepsByKey;
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

  const steps: PipeStep<T>[] = [];

  nextPlayout: while (playouts.startAt(0)) {
    if (script.paused.done) {
      return new Gen(script, steps, script.paused); // constant
    }
    let state = script.paused;
    while (true) {
      const next = generateStep(
        state,
        pick,
        playouts,
      );
      if (next === filtered) {
        continue nextPlayout;
      }
      steps.push({ start: state, picks: next.picks });
      if (next.result.done) {
        return new Gen(script, steps, next.result); // finished
      }
      state = next.result;
    }
  }
  return filtered;
}

type GenStep<T> = { picks: PickView; result: Paused<T> | Done<T> };

function generateStep<T>(
  start: Paused<T>,
  pick: PickFunction,
  playouts: PlayoutSource,
):
  | GenStep<T>
  | typeof filtered {
  const depth = playouts.depth;
  while (playouts.startValue(depth)) {
    const result = start.step(pick);
    if (result === filtered) {
      if (playouts.state === "picking") {
        playouts.endPlayout();
      }
      continue;
    }
    const reqs = playouts.getRequests(depth);
    const replies = playouts.getReplies(depth);
    const picks = PickView.wrap(reqs, replies);
    return { picks, result };
  }

  return filtered; // no playouts matched at this depth
}
