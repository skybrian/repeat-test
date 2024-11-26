import type { Pickable, PickFunction, PickFunctionOpts } from "./pickable.ts";
import type { Backtracker } from "./backtracking.ts";
import type { Gen } from "./gen_class.ts";
import type { RowCase } from "./arbitraries/rows.ts";
import type { Domain } from "./domain_class.ts";
import type { RowShape } from "./domains/rows.ts";

import { assert } from "@std/assert";
import { PickRequest } from "./picks.ts";
import { filtered } from "./results.ts";
import { Script } from "./script_class.ts";
import { generate } from "./gen_class.ts";
import { PickTree } from "./pick_tree.ts";
import { orderedPlayouts } from "./ordered.ts";
import { scriptOf } from "./scripts/scriptOf.ts";

/**
 * Picks from all items in a Domain, without replacement.
 *
 * A Jar can be used to generate permutations or unique ids.
 */
export class Jar<T> {
  /** Keps track of which pick sequences remain to be chosen. */
  private readonly remaining = new PickTree();

  /** An example item that serves as proof that the Jar isn't empty yet. */
  private example: Gen<T> | undefined;

  /** A source of more items. It won't run out until the Jar is empty. */
  private readonly moreExamples: Backtracker;

  /** A count of the number of items removed. */
  private taken = 0;

  /**
   * Creates a mutable set of all the values in a Domain.
   *
   * (The items are not stored anywhere; they will be generated when needed.)
   */
  constructor(readonly dom: Domain<T>) {
    this.moreExamples = orderedPlayouts();
    this.example = this.#nextExample();
  }

  /** Returns true if there are any items left in the Jar. */
  isEmpty(): boolean {
    return this.example === undefined;
  }

  /** Returns true if the given item is in the Jar. */
  has(item: unknown): item is T {
    const canon = this.dom.regenerate(item);
    if (!canon.ok) {
      return false;
    }
    return this.remaining.available(canon.replies);
  }

  /**
   * Takes a specific item from the Jar.
   *
   * Returns true if the item was previously in the Jar and successfully taken.
   */
  take(item: unknown): boolean {
    const canon = this.dom.regenerate(item);
    if (!canon.ok) {
      return false;
    }

    if (!this.remaining.prune(canon)) {
      return false;
    }

    this.#refreshExample();
    this.taken++;
    return true;
  }

  /**
   * Takes any value remaining in the Jar.
   *
   * @throws {@link Pruned} if the Jar is empty.
   */
  takeAny(pick: PickFunction, opts?: { accept: (val: T) => boolean }): T {
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

    const custom = opts?.accept;
    const inJar = (val: T): boolean => {
      // Compare using the canonical picks for this value.
      const canon = this.dom.regenerate(val);
      assert(canon.ok, "regenerate should always succeed");
      return this.remaining.prune(canon);
    };
    const accept = custom ? (val: T) => custom(val) && inJar(val) : inJar;

    // Hack: increase the number of tries to try to avoid running out when many
    // values have already been taken. (Ideally we'd use some better way than
    // filtering when there are few values left.)
    const maxTries = this.taken + 1000;

    const val = pick(script, { accept, maxTries });
    this.#refreshExample();
    this.taken++;
    return val;
  }

  /**
   * Removes items until one is found that's acceptable.
   *
   * Returns true if an acceptable item was found.
   */
  removeUntil(accept: (val: T) => boolean): boolean {
    while (this.example !== undefined) {
      if (accept(this.example.val)) {
        return true;
      }
      assert(this.remaining.prune(this.example));
      this.example = this.#nextExample();
      this.taken++;
    }
    return false;
  }

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

/**
 * Picks from all elements in the union of multiple Domains, intersected with a
 * common Domain.
 *
 * A common Domain is needed because each Domain may serialize a value using a
 * different format. Often, the common Domain will be the superset of all case
 * Domains, but this isn't necessary.
 */
export class UnionJar<T> {
  private readonly commonJar: Jar<T>;

  /** Invariant: each case jar is non-empty. */
  private readonly caseJars: Map<number, Jar<unknown>> = new Map();

  constructor(common: Domain<T>, cases: Domain<unknown>[]) {
    const commonJar = new Jar(common);

    const acceptable = (val: unknown): val is T => {
      return commonJar.has(val);
    };

    for (let i = 0; i < cases.length; i++) {
      const jar = new Jar(cases[i]);
      jar.removeUntil(acceptable);
      if (!jar.isEmpty()) {
        this.caseJars.set(i, jar);
      }
    }

    this.commonJar = commonJar;
  }

  isEmpty() {
    return this.commonJar.isEmpty() || this.caseJars.size === 0;
  }

  take(item: unknown): boolean {
    const commonRemoved = this.commonJar.take(item);

    const acceptable = (val: unknown): val is T => {
      return this.commonJar.has(val);
    };

    let caseRemoved = false;
    for (const [key, jar] of Array.from(this.caseJars)) {
      if (jar.take(item)) {
        caseRemoved = true;
        jar.removeUntil(acceptable);
        if (jar.isEmpty()) {
          this.caseJars.delete(key);
        }
      }
    }

    return commonRemoved && caseRemoved;
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
    keyShape: Partial<RowShape<T>>,
  ) {
    const keys = Object.keys(keyShape) as (keyof T)[];
    for (const key of keys) {
      const prop = keyShape[key];
      assert(prop);
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

  takeAny(pick: PickFunction): T {
    const c = this.chooseCase.directBuild(pick);

    const row: Record<string, unknown> = {};
    for (const key of Object.keys(c.shape)) {
      const jar = this.keys[key];
      if (jar) {
        row[key] = jar.takeAny(pick);
      } else {
        row[key] = pick(c.shape[key]);
      }
    }
    return row as T;
  }
}
