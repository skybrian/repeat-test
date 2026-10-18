import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Gen, Jar, Script } from "@skybrian/repeat-test/core";
import * as dom from "@skybrian/repeat-test/doms";

describe("Jar", () => {
  it("retains the domain passed to its constructor", () => {
    const domain = dom.of(1, 2);
    const jar = new Jar(domain);
    assert.strictEqual(jar.dom, domain);
  });

  it("has only domain members that haven't been taken", () => {
    const jar = new Jar(dom.of(1, 2));
    assert.equal(jar.has(1), true);
    assert.equal(jar.has(2), true);
    assert.equal(jar.has(3), false);
    assert.equal(jar.has("1"), false);
    assert.equal(jar.take(1), true);
    assert.equal(jar.has(1), false);
    assert.equal(jar.has(2), true);
  });

  it("take reports whether a value was removed and updates isEmpty", () => {
    const jar = new Jar(dom.of("hi"));
    assert.equal(jar.isEmpty(), false);
    assert.equal(jar.take("x"), false);
    assert.equal(jar.isEmpty(), false);
    assert.equal(jar.take("hi"), true);
    assert.equal(jar.take("hi"), false);
    assert.equal(jar.isEmpty(), true);
  });

  describe("takeAny", () => {
    it("takes the only value and empties the jar", () => {
      const script = Script.make("take a constant", (pick) => {
        const jar = new Jar(dom.of("hi"));
        const value = jar.takeAny(pick);
        assert.equal(jar.isEmpty(), true);
        assert.equal(jar.has(value), false);
        return value;
      });
      assert.equal(Gen.mustBuild(script, []).val, "hi");
    });

    it("takes each boolean without replacement", () => {
      const script = Script.make("take both booleans", (pick) => {
        const jar = new Jar(dom.of(false, true));
        const first = jar.takeAny(pick);
        assert.equal(jar.isEmpty(), false);
        const second = jar.takeAny(pick);
        assert.notEqual(first, second);
        assert.equal(jar.isEmpty(), true);
        return [first, second];
      });
      for (const first of [0, 1]) {
        const gen = Gen.mustBuild(script, [first, 1 - first]);
        const expected = [first === 1, first !== 1];
        assert.deepEqual(gen.val, expected);
        // Replaying a mutable result must start with a fresh Jar, too.
        assert.deepEqual(gen.val, expected);
      }
    });

    it("cannot build a script that takes from an exhausted jar", () => {
      const script = Script.make("take twice", (pick) => {
        const jar = new Jar(dom.of("hi"));
        jar.takeAny(pick);
        return jar.takeAny(pick);
      });
      assert.equal(Gen.build(script, []).ok, false);
      assert.throws(
        () => Gen.mustBuild(script, []),
        /can't build 'take twice'/,
      );
    });

    it("takes a value when accept returns true", () => {
      const script = Script.make("accept a constant", (pick) => {
        const jar = new Jar(dom.of("hi"));
        return jar.takeAny(pick, { accept: () => true });
      });
      assert.equal(Gen.mustBuild(script, []).val, "hi");
    });

    it("only takes accepted values", () => {
      const script = Script.make("accept there", (pick) => {
        const jar = new Jar(dom.of("hi", "there"));
        const value = jar.takeAny(pick, { accept: (x) => x === "there" });
        assert.equal(jar.has("there"), false);
        assert.equal(jar.has("hi"), true);
        return value;
      });
      assert.equal(Gen.build(script, [0]).ok, false);
      assert.equal(Gen.mustBuild(script, [1]).val, "there");
    });

    it("fails when no value is acceptable", () => {
      const script = Script.make("reject all", (pick) => {
        const jar = new Jar(dom.of("hi"));
        return jar.takeAny(pick, { accept: () => false });
      });
      assert.equal(Gen.build(script, []).ok, false);
    });
  });

  describe("removeUntil", () => {
    it("returns true without removing an acceptable starting value", () => {
      const jar = new Jar(dom.of(1, 2, 3));
      assert.equal(jar.removeUntil(() => true), true);
      assert.equal(jar.take(1), true);
      assert.equal(jar.take(2), true);
      assert.equal(jar.take(3), true);
      assert.equal(jar.isEmpty(), true);
    });

    it("returns false after removing every value", () => {
      const jar = new Jar(dom.of(1, 2, 3));
      assert.equal(jar.removeUntil(() => false), false);
      assert.equal(jar.isEmpty(), true);
      assert.equal(jar.removeUntil(() => true), false);
    });

    it("removes starting values but keeps the first accepted value", () => {
      const jar = new Jar(dom.of(1, 2, 3));
      assert.equal(jar.removeUntil((x) => x > 1), true);
      assert.equal(jar.isEmpty(), false);
      assert.equal(jar.take(1), false);
      assert.equal(jar.take(2), true);
      assert.equal(jar.take(3), true);
      assert.equal(jar.isEmpty(), true);
    });

    it("doesn't filter values after the first accepted value", () => {
      const jar = new Jar(dom.of(1, 2, 3));
      assert.equal(jar.removeUntil((x) => x < 3), true);
      assert.equal(jar.take(1), true);
      assert.equal(jar.take(2), true);
      assert.equal(jar.take(3), true);
      assert.equal(jar.isEmpty(), true);
    });
  });
});
