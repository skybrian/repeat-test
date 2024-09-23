import type { Success } from "./results.ts";
import { onePlayout } from "./backtracking.ts";
import { generate, type PickSet } from "./generated.ts";
import { EditPicker, type IntEditor, type PickRequest } from "./picks.ts";

/** A list of pick requests with its replies. */
export type Playout = {
  readonly reqs: PickRequest[];
  readonly replies: number[];
};

/**
 * A generated value and the picks that were used to generate it.
 */
export class Gen<T> implements Success<T> {
  /** Satisfies the Success interface. */
  readonly ok = true;

  /**
   * Creates a generated value with the given contents.
   *
   * This constructor should not normally be called directly. Instead, use
   * the {@link generate} method or a {@link Domain}.
   */
  constructor(
    private readonly set: PickSet<T>,
    readonly reqs: PickRequest[],
    readonly replies: number[],
    readonly val: T,
  ) {}

  /**
   * Returns the lenght of the playout with default picks removed from the end.
   */
  get trimmedPlayoutLength(): number {
    const { reqs, replies } = this;
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
      reqs: this.reqs.slice(0, len),
      replies: this.replies.slice(0, len),
    };
  }

  /**
   * Regenerates the value after editing its picks.
   * @returns the new value, or undefined if no change is available.
   */
  mutate(edit: IntEditor): Gen<T> | undefined {
    const picker = new EditPicker(this.replies, edit);
    const gen = generate(this.set, onePlayout(picker));
    if (picker.edits === 0 && picker.deletes === 0) {
      return undefined; // no change
    }
    return gen;
  }
}
