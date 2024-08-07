import { PickList } from "./picks.ts";
import { PickFunction } from "./pick_function.ts";
import { PickTree } from "./pick_tree.ts";
import Arbitrary from "./arbitrary_class.ts";
import Domain from "./domain_class.ts";
import { assert } from "@std/assert";

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

    // Also prune the non-canonical picks so we know when we're done.
    this.remaining.prune(picks);

    return accept;
  };

  constructor(readonly dom: Domain<T>) {}

  /**
   * Returns true if there are any values left in the jar.
   */
  isEmpty(): boolean {
    return this.remaining.done;
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
