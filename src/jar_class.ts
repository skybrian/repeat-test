import { assert } from "@std/assert";

import type { PickList } from "./picks.ts";
import type { PickFunction } from "./pick_function.ts";
import { PickTree } from "./pick_tree.ts";
import { Arbitrary } from "./arbitrary_class.ts";
import type { Domain } from "./domain_class.ts";
import { generateAll } from "./multipass_search.ts";

/**
 * Picks from the possible values in a Domain, without replacement.
 *
 * A jar can be used to generate permutations or unique ids.
 */
export class Jar<T> {
  private readonly remaining = new PickTree();

  private accept = (val: T, picks: PickList): boolean => {
    // Compare using the canonical picks.
    const gen = this.dom.regenerate(val);
    assert(gen.ok, "regenerate should always succeed");

    const accept = this.remaining.prune(gen.picks());

    if (accept) {
      // Also prune the non-canonical picks so we know we're done.
      this.remaining.prune(picks);
    }

    return accept;
  };

  constructor(readonly dom: Domain<T>) {}

  /**
   * Returns true if there are any values left in the jar.
   */
  isEmpty(): boolean {
    if (this.remaining.done) {
      return true;
    }
    // Search for a pick whose canonical value hasn't been pruned.
    // TODO: This is an n^2 algorithm since we always start the search from the beginning.
    for (const gen of generateAll(this.dom)) {
      const regen = this.dom.regenerate(gen.val);
      assert(regen.ok, "regenerate should always succeed");
      if (this.remaining.available(regen.replies())) {
        return false;
      }
      // Prune non-canonical pick.
      this.remaining.prune(gen.picks());
    }
    return true;
  }

  /**
   * Takes an unused value from the jar.
   *
   * @throws {@link Pruned} if the jar is empty.
   */
  take(pick: PickFunction): T {
    return pick(this.dom, { accept: this.accept });
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
