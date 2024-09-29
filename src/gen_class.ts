import type { Success } from "./results.ts";
import type { IntEditor, PickRequest } from "./picks.ts";
import type { PickSet } from "./generated.ts";
import type { SystemConsole } from "./console.ts";

import { EditPicker } from "./picks.ts";
import { onePlayout } from "./backtracking.ts";
import { generate, mustGenerate } from "./generated.ts";

/** Something that accepts a stream of pick requests and replies. */
export interface PlayoutSink {
  /**
   * Accests a pick request and reply.
   *
   * If the sink doesn't want more picks, it can return false or throw an Error.
   */
  push(req: PickRequest, pick: number): boolean;
}

/** A list of pick requests with its replies. */
export class Playout {
  constructor(readonly reqs: PickRequest[], readonly replies: number[]) {}

  getPick(index: number): { req: PickRequest; reply: number } {
    return { req: this.reqs[index], reply: this.replies[index] };
  }

  getOption(index: number): number | undefined {
    if (index >= this.reqs.length) {
      return undefined;
    }
    const req = this.reqs[index];
    if (req.min !== 0 || req.max !== 1) {
      return undefined;
    }
    return this.replies[index];
  }

  get length(): number {
    return this.reqs.length;
  }

  /**
   * Returns the length of the playout with default picks removed from the end.
   */
  get trimmedLength(): number {
    const reqs = this.reqs;
    const replies = this.replies;
    let last = replies.length - 1;
    while (last >= 0 && replies[last] === reqs[last].min) {
      last--;
    }
    return last + 1;
  }

  /**
   * Returns the requests and replies with default picks removed from the end.
   */
  trimmed(): Playout {
    const len = this.trimmedLength;
    return new Playout(
      this.reqs.slice(0, len),
      this.replies.slice(0, len),
    );
  }

  pushTo(sink: PlayoutSink): boolean {
    for (let i = 0; i < this.reqs.length; i++) {
      const req = this.reqs[i];
      const reply = this.replies[i];
      if (!sink.push(req, reply)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Writes the playout to a console.
   */
  logTo(console: SystemConsole): void {
    const reqs = this.reqs;
    const replies = this.replies;
    for (let i = 0; i < reqs.length; i++) {
      const req = reqs[i];
      const reply = replies[i];
      console.log(`${i}: ${req.min}..${req.max} =>`, reply);
    }
  }
}

const needGenerate = Symbol("needGenerate");

/**
 * A generated value and the picks that were used to generate it.
 */
export class Gen<T> implements Success<T> {
  readonly #set: PickSet<T>;
  #val: T | typeof needGenerate;
  readonly playouts: Playout[];

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
    readonly deps: Gen<unknown> | undefined,
    val: T,
  ) {
    const playouts = [];
    if (deps) {
      playouts.push(...deps.playouts);
    }
    playouts.push(new Playout(reqs, replies));

    this.#set = set;
    this.#val = val;
    this.playouts = playouts;
  }

  /** Satisfies the Success interface. */
  get ok(): true {
    return true;
  }

  private get reqs(): PickRequest[] {
    if (this.playouts.length === 1) {
      return this.playouts[0].reqs;
    }
    return this.playouts.map((p) => p.reqs).flat();
  }

  private get replies(): number[] {
    if (this.playouts.length === 1) {
      return this.playouts[0].replies;
    }
    return this.playouts.map((p) => p.replies).flat();
  }

  get playout(): Playout {
    return new Playout(this.reqs, this.replies);
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
}
