import type { Success } from "./results.ts";
import type { IntEditor, PickRequest } from "./picks.ts";
import type { PickSet } from "./generated.ts";

import { EditPicker, PickList } from "./picks.ts";
import { onePlayout } from "./backtracking.ts";
import { generate, mustGenerate } from "./generated.ts";

const needGenerate = Symbol("needGenerate");

/**
 * A generated value and the picks that were used to generate it.
 */
export class Gen<T> implements Success<T> {
  readonly #set: PickSet<T>;
  #val: T | typeof needGenerate;
  readonly playouts: PickList[];

  /**
   * Creates a generated value with the given contents.
   *
   * This constructor should not normally be called directly. Instead, use
   * the {@link generate} method or a {@link Domain}.
   */
  private constructor(
    set: PickSet<T>,
    reqs: PickRequest[],
    replies: number[],
    readonly deps: Gen<unknown> | undefined,
    val: T,
  ) {
    const playouts = [];
    if (deps) {
      playouts.push(...deps.playouts);
    }
    playouts.push(new PickList(reqs, replies));

    this.#set = set;
    this.#val = val;
    this.playouts = playouts;
  }

  /** Satisfies the Success interface. */
  get ok(): true {
    return true;
  }

  get label(): string {
    return this.#set.label;
  }

  private get allReqs(): PickRequest[] {
    if (this.playouts.length === 1) {
      return this.playouts[0].reqs;
    }
    return this.playouts.map((p) => p.reqs).flat();
  }

  get allReplies(): number[] {
    if (this.playouts.length === 1) {
      return this.playouts[0].replies;
    }
    return this.playouts.map((p) => p.replies).flat();
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

  static fromSet<T>(
    set: PickSet<T>,
    reqs: PickRequest[],
    replies: number[],
    val: T,
  ): Gen<T> {
    return new Gen(set, reqs, replies, undefined, val);
  }

  static fromDeps<T>(
    set: PickSet<T>,
    reqs: PickRequest[],
    replies: number[],
    deps: Gen<unknown>,
    val: T,
  ): Gen<T> {
    return new Gen(set, reqs, replies, deps, val);
  }
}
