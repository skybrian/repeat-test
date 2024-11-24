import type { Pickable, PickFunction, PickFunctionOpts } from "./pickable.ts";
import type { Backtracker } from "./backtracking.ts";
import type { Gen } from "./gen_class.ts";
import type { RowCase } from "./arbitraries/rows.ts";

import { assert } from "@std/assert";
import { PickRequest } from "./picks.ts";
import { filtered } from "./results.ts";
import { Script } from "./script_class.ts";
import { generate } from "./gen_class.ts";
import { PickTree } from "./pick_tree.ts";
import { orderedPlayouts } from "./ordered.ts";
import { Domain } from "./domain_class.ts";
import { scriptOf } from "./scripts/scriptOf.ts";

/**
 * Picks from the possible values in a Domain, without replacement.
 *
 * A jar can be used to generate permutations or unique ids.
 */
export class Jar<T> {
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
  private readonly moreExamples: Backtracker;

  private taken = 0;

  /**
   * Creates a mutable set of all the values in a domain.
   *
   * (Conceptually; the values will be generated when needed.)
   */
  constructor(readonly dom: Domain<T>) {
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
    const toCall = this.dom.buildScript;

    const script = Script.make(
      `take(${toCall.name})`,
      (pick: PickFunction) => {
        const walk = this.remaining.walk();

        // Narrow the range of each pick request to avoid generating values that
        // were already taken.
        function narrowedPick<T>(
          req: Pickable<T>,
          opts?: PickFunctionOpts<T>,
        ): T {
          if (req instanceof PickRequest) {
            const innerReq = walk.narrow(req);
            const n = pick(innerReq);
            assert(walk.push(req, n));
            return n as T;
          } else {
            return pick(req, opts);
          }
        }

        return toCall.directBuild(narrowedPick);
      },
      { cachable: false },
    );

    // Hack: increase the number of tries to try to avoid running out when many
    // values have already been taken. (Ideally we'd use some better way than
    // filtering when there are few values left.)
    const maxTries = this.taken + 1000;

    const val = pick(script, { accept: this.#accept, maxTries });
    this.#refreshExample();
    this.taken++;
    return val;
  }

  #accept = (val: T): boolean => {
    // Compare using the canonical picks for this value.
    const canon = this.dom.regenerate(val);
    assert(canon.ok, "regenerate should always succeed");

    return this.remaining.prune(canon);
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

type KeyToJar<T> = {
  [P in keyof T]?: Jar<T[P]>;
};

export class RowJar<T extends Record<string, unknown>> {
  readonly keys: KeyToJar<T> = {};
  readonly chooseCase: Script<RowCase<T>>;

  constructor(
    readonly cases: RowCase<T>[],
    uniqueKeys: (keyof T)[],
  ) {
    for (const key of uniqueKeys) {
      const prop = this.cases[0].shape[key];
      assert(prop instanceof Domain);
      this.keys[key] = new Jar(prop);
    }
    this.chooseCase = scriptOf(this.cases);
  }

  isEmpty(): boolean {
    for (const jar of Object.values(this.keys)) {
      if (jar.isEmpty()) {
        return true;
      }
    }
    return false;
  }

  assertNotEmpty() {
    for (const jar of Object.values(this.keys)) {
      assert(!jar.isEmpty());
    }
  }

  take(pick: PickFunction): T {
    const c = this.chooseCase.directBuild(pick);

    const row: Record<string, unknown> = {};
    for (const key of Object.keys(c.shape)) {
      const jar = this.keys[key];
      if (jar) {
        row[key] = jar.take(pick);
      } else {
        row[key] = pick(c.shape[key]);
      }
    }
    return row as T;
  }
}
