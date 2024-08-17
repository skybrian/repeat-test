import { assert } from "@std/assert";

import type { PickFunction } from "./pick_function.ts";
import { PickTree } from "./pick_tree.ts";
import { Arbitrary } from "./arbitrary_class.ts";
import type { Domain } from "./domain_class.ts";
import { MultipassSearch } from "./multipass_search.ts";
import { generate, type Generated } from "./generated_class.ts";
import { PickList } from "./picks.ts";

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
  private example: Generated<T> | undefined;

  /**
   * A source of additional examples to test. It won't run out until the jar is
   * empty.
   */
  private readonly moreExamples: MultipassSearch;

  constructor(readonly dom: Domain<T>) {
    this.moreExamples = new MultipassSearch();
    this.example = this.nextExample();
  }

  /**
   * Returns true if there are any values left in the jar.
   */
  isEmpty(): boolean {
    return this.example === undefined;
  }

  /**
   * Takes an unused value from the jar.
   *
   * @throws {@link Pruned} if the jar is empty.
   */
  take(pick: PickFunction): T {
    const val = pick(this.dom, { accept: this.accept });
    this.refreshExample();
    return val;
  }

  private accept = (val: T): boolean => {
    // Compare using the canonical picks for this value.
    const canon = this.dom.regenerate(val);
    assert(canon.ok, "regenerate should always succeed");

    const picks = PickList.zip(canon.requests(), canon.replies());
    return this.remaining.prune(picks);
  };

  private refreshExample(): void {
    while (this.example !== undefined) {
      if (this.remaining.available(this.example.replies())) {
        return; // still valid
      }
      this.example = this.nextExample();
    }
    return; // empty
  }

  private nextExample(): Generated<T> | undefined {
    const next = generate(this.dom, this.moreExamples);
    if (next === undefined) {
      return undefined;
    }
    const regen = this.dom.regenerate(next.val);
    assert(regen.ok, "regenerate should always succeed");
    return regen;
  }

  /**
   * Returns all the values in a domain, in a deterministic but arbitrary order.
   */
  static takeAll<T>(dom: Domain<T>): T[] {
    const arb = Arbitrary.from((pick) => {
      const out: T[] = [];
      const jar = new Jar(dom);
      while (!jar.isEmpty()) {
        const val = jar.take(pick);
        out.push(val);
      }
      return out;
    });
    return arb.default().val;
  }
}
