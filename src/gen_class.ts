import type { Success } from "./results.ts";
import type { IntEditor, PickRequest } from "./picks.ts";
import type { PlayoutSource } from "./backtracking.ts";
import type { PickFunction, PickSet } from "./generated.ts";

import { EditPicker, PickList, PlaybackPicker } from "./picks.ts";
import { onePlayout, Pruned } from "./backtracking.ts";
import { generate, makePickFunction, mustGenerate } from "./generated.ts";

const needGenerate = Symbol("needGenerate");

export type ThenFunction<In, Out> = (deps: In, pick: PickFunction) => Out;

/**
 * A generated value and the picks that were used to generate it.
 */
export class Gen<T> implements Success<T> {
  readonly #set: PickSet<T>;
  readonly #makeReqs: () => PickRequest[];
  readonly #makeReplies: () => number[];

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
    reqs: () => PickRequest[],
    replies: () => number[],
    val: T,
  ) {
    this.#set = set;
    this.#makeReqs = reqs;
    this.#makeReplies = replies;
    this.#val = val;
  }

  /** Satisfies the Success interface. */
  get ok(): true {
    return true;
  }

  get label(): string {
    return this.#set.label;
  }

  private get allReqs(): PickRequest[] {
    if (this.#reqs === undefined) {
      this.#reqs = this.#makeReqs();
    }
    return this.#reqs;
  }

  get allReplies(): number[] {
    if (this.#replies === undefined) {
      this.#replies = this.#makeReplies();
    }
    return this.#replies;
  }

  get allPicks(): PickList {
    return new PickList(this.allReqs, this.allReplies);
  }

  /**
   * Returns the value that was generated.
   *
   * If not a frozen value, accessing this property will generate a new clone
   * each time after the first access.
   */
  get val(): T {
    if (this.#val === needGenerate) {
      return mustGenerate(this.#set, this.allReplies);
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
    const picker = new EditPicker(this.allReplies, edit);
    const gen = generate(this.#set, onePlayout(picker));
    if (picker.edits === 0 && picker.deletes === 0) {
      return undefined; // no change
    }
    return gen;
  }
  /**
   * Generates a value from this one, using additional picks.
   */
  thenGenerate<Out>(
    then: ThenFunction<T, Out>,
    playouts: PlayoutSource,
  ): Gen<Out> | undefined {
    const label = "untitled";
    const generateFrom = (pick: PickFunction) => then(this.val, pick);

    const depth = playouts.depth;
    while (playouts.startValue(depth)) {
      try {
        const pick = makePickFunction(playouts);
        const val = generateFrom(pick);
        const thenReqs = playouts.getRequests(depth);
        const thenReplies = playouts.getReplies(depth);
        const reqs = () => this.allReqs.concat(thenReqs);
        const replies = () => this.allReplies.concat(thenReplies);
        return Gen.fromDeps(label, this, then, reqs, replies, val);
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

  static fromSet<T>(
    set: PickSet<T>,
    reqs: PickRequest[],
    replies: number[],
    val: T,
  ): Gen<T> {
    return new Gen(set, () => reqs, () => replies, val);
  }

  static fromDeps<Deps, T>(
    label: string,
    deps: Gen<Deps>,
    then: ThenFunction<Deps, T>,
    reqs: () => PickRequest[],
    replies: () => number[],
    val: T,
  ): Gen<T> {
    const set = {
      label,
      generateFrom: (pick: PickFunction) => then(deps.val, pick),
    };
    return new Gen(set, reqs, replies, val);
  }

  static mustBuild<T>(set: PickSet<T>, replies: number[]): Gen<T> {
    const picker = new PlaybackPicker(replies);
    const gen = generate(set, onePlayout(picker));
    if (picker.error) {
      throw new Error(`can't generate ${set.label}: ${picker.error}`);
    } else if (gen === undefined) {
      throw new Error(`can't generate ${set.label}: picks not accepted`);
    }
    return gen;
  }
}
