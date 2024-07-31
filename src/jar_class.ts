import { PickList } from "./picks.ts";
import { PickTree } from "./searches.ts";
import Arbitrary, { PickFunction } from "./arbitrary_class.ts";
import Domain from "./domain_class.ts";

/**
 * Picks from the possible values in a Domain, without replacement.
 *
 * This can be used to generate permutations.
 */
export class Jar<T> {
  private readonly remaining = new PickTree();

  private accept = (val: T, picks: PickList): boolean => {
    // Compare using the canonical picks.
    const gen = this.dom.regenerate(val);
    if (gen === undefined) {
      return false;
    }
    const accept = this.remaining.prune(gen.picks());

    // Also prune the non-canonical picks so we know when we're done.
    this.remaining.prune(picks);

    return accept;
  };

  constructor(readonly dom: Domain<T>) {}

  /**
   * Returns true if there are any values left that haven't been used.
   */
  isEmpty(): boolean {
    return this.remaining.done();
  }

  /**
   * Picks from an arbitrary with a filter that prevents it from using the same
   * pick sequence twice.
   *
   * @throws {@link Pruned} if the picks were used already.
   */
  pickUnused(pick: PickFunction): T {
    return pick(this.dom.generator, { accept: this.accept });
  }

  /**
   * Takes the value with the given picks from the jar.
   *
   * @throws {@link Pruned} if the picks were used already.
   */
  take(picks: number[]): T {
    const gen = Arbitrary.runWithPicks(picks, (p) => this.pickUnused(p));
    return gen.val;
  }

  /**
   * Returns all the values in a domain, in a deterministic but arbitrary order.
   */
  static takeAll<T>(dom: Domain<T>): T[] {
    const arb = Arbitrary.from((pick) => {
      const out: T[] = [];
      const jar = new Jar(dom);
      while (!jar.isEmpty()) {
        const val = jar.pickUnused(pick);
        out.push(val);
      }
      return out;
    });
    return arb.default();
  }
}
