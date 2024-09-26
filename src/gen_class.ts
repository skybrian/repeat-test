import type { Success } from "./results.ts";
import type { IntEditor, PickRequest } from "./picks.ts";
import type { PickSet } from "./generated.ts";

import { EditPicker } from "./picks.ts";
import { onePlayout } from "./backtracking.ts";
import { generate, mustGenerate } from "./generated.ts";

/** A list of pick requests with its replies. */
export type Playout = {
  readonly reqs: PickRequest[];
  readonly replies: number[];
};

const needGenerate = Symbol("needGenerate");

/**
 * A generated value and the picks that were used to generate it.
 */
export class Gen<T> implements Success<T> {
  readonly #set: PickSet<T>;
  readonly #reqs: PickRequest[];
  readonly #replies: number[];
  #val: T | typeof needGenerate;

  /**
   * Creates a generated value with the given contents.
   *
   * This constructor should not normally be called directly. Instead, use
   * the {@link generate} method or a {@link Domain}.
   */
  constructor(
    set: PickSet<T>,
    reqs: PickRequest[],
    replies: number[],
    val: T,
  ) {
    this.#set = set;
    this.#val = val;
    this.#reqs = reqs;
    this.#replies = replies;
  }

  /** Satisfies the Success interface. */
  get ok(): true {
    return true;
  }

  /**
   * Returns the value that was generated.
   *
   * If not a frozen value, accessing this property will generate a new clone
   * each time after the first access.
   */
  get val(): T {
    if (this.#val === needGenerate) {
      return mustGenerate(this.#set, this.#replies);
    }
    const val = this.#val;
    if (!Object.isFrozen(val)) {
      this.#val = needGenerate;
    }
    return val;
  }

  get playout(): Playout {
    return {
      reqs: this.#reqs,
      replies: this.#replies,
    };
  }

  /**
   * Returns the lenght of the playout with default picks removed from the end.
   */
  get trimmedPlayoutLength(): number {
    const { reqs, replies } = this.playout;
    let last = replies.length - 1;
    while (last >= 0 && replies[last] === reqs[last].min) {
      last--;
    }
    return last + 1;
  }

  /**
   * Returns the requests and replies with default picks removed from the end.
   */
  trimmedPlayout(): Playout {
    const len = this.trimmedPlayoutLength;
    return {
      reqs: this.#reqs.slice(0, len),
      replies: this.#replies.slice(0, len),
    };
  }

  /**
   * Regenerates the value after editing its picks.
   * @returns the new value, or undefined if no change is available.
   */
  mutate(edit: IntEditor): Gen<T> | undefined {
    const picker = new EditPicker(this.#replies, edit);
    const gen = generate(this.#set, onePlayout(picker));
    if (picker.edits === 0 && picker.deletes === 0) {
      return undefined; // no change
    }
    return gen;
  }
}
