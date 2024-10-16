import type { Pickable, PickFunction, PickFunctionOpts } from "./pickable.ts";
import type { PlayoutSource } from "./backtracking.ts";
import type { Gen } from "./gen_class.ts";
import type { Domain } from "./domain_class.ts";

import { assert } from "@std/assert";
import { PickRequest } from "./picks.ts";
import { filtered } from "./results.ts";
import { Script } from "./script_class.ts";
import { generate } from "./gen_class.ts";
import { PickTree } from "./pick_tree.ts";
import { orderedPlayouts } from "./ordered.ts";

/**
 * Picks an integer in the given range.
 *
 * A minimum implementation will just call next(), but it can also substitute a
 * different PickRequest, such as one with a narrower range.
 */
export type IntPickerMiddleware = (
  req: PickRequest,
  next: (req: PickRequest) => number,
) => number;

function makeMiddleware<T>(
  name: string,
  build: (pick: PickFunction) => T,
  startMiddle: () => IntPickerMiddleware,
): Script<T> {
  const middleBuild = (pick: PickFunction) => {
    const middle = startMiddle();
    function middlePick<T>(
      req: Pickable<T>,
      opts?: PickFunctionOpts<T>,
    ) {
      if (req instanceof PickRequest) {
        return middle(req, pick) as T;
      } else {
        return pick(req, opts);
      }
    }
    return build(middlePick);
  };
  return Script.make(name, middleBuild, { cachable: false });
}

/**
 * Picks from the possible values in a Domain, without replacement.
 *
 * A jar can be used to generate permutations or unique ids.
 */
export class Jar<T> {
  private readonly name;
  private readonly remaining = new PickTree();

  /**
   * An example that hasn't been taken, serving as proof that the jar isn't
   * empty.
   *
   * It should be regenerated by the domain so that the picks are canonical.
   */
  private example: Gen<T> | undefined;

  /**
   * A source of additional examples to test. It won't run out until the jar is
   * empty.
   */
  private readonly moreExamples: PlayoutSource;

  private taken = 0;

  /**
   * Creates a mutable set of all the values in a domain.
   *
   * (Conceptually; the values will be generated when needed.)
   */
  constructor(readonly dom: Domain<T>) {
    this.name = `take(${this.dom.name})`;
    this.moreExamples = orderedPlayouts();
    this.example = this.#nextExample();
  }

  /**
   * Returns true if there are any values left in the jar.
   */
  isEmpty(): boolean {
    return this.example === undefined;
  }

  /**
   * Takes a previously-unused value from the jar.
   *
   * @throws {@link Pruned} if the jar is empty.
   */
  take(pick: PickFunction): T {
    const remaining = this.remaining;
    function middle(): IntPickerMiddleware {
      const walk = remaining.walk();
      function narrowToRemaining(
        req: PickRequest,
        next: (req: PickRequest) => number,
      ): number {
        const innerReq = walk.narrow(req);
        assert(innerReq !== undefined);
        const n = next(innerReq);
        assert(walk.push(req, n));
        return n;
      }
      return narrowToRemaining;
    }

    // Hack: increase the number of tries to try to avoid running out when many
    // values have already been taken. (Ideally we'd use some better way than
    // filtering when there are few values left.)
    const maxTries = this.taken + 1000;

    const script = makeMiddleware(this.name, this.dom.buildFrom, middle);
    const val = pick(script, { accept: this.#accept, maxTries });
    this.#refreshExample();
    this.taken++;
    return val;
  }

  #accept = (val: T): boolean => {
    // Compare using the canonical picks for this value.
    const canon = this.dom.regenerate(val);
    assert(canon.ok, "regenerate should always succeed");

    return this.remaining.prune(canon.picks);
  };

  #refreshExample(): void {
    while (this.example !== undefined) {
      if (this.remaining.available(this.example.replies)) {
        return; // still valid
      }
      this.example = this.#nextExample();
    }
    return; // empty
  }

  #nextExample(): Gen<T> | undefined {
    const next = generate(this.dom, this.moreExamples);
    if (next === filtered) {
      return undefined;
    }
    const regen = this.dom.regenerate(next.val);
    assert(regen.ok, "regenerate should always succeed");
    return regen;
  }
}
