import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  Filtered,
  filtered,
  Gen,
  IntRequest,
  type PickFunction,
  Script,
} from "@skybrian/repeat-test/core";

const noPicks = () => {
  throw new Error("unexpected pick");
};

describe("Script", () => {
  describe("make", () => {
    it("sets the name and defaults to weight 1 and no options", () => {
      const script = Script.make("constant", () => true);
      assert.equal(script.name, "constant");
      assert.equal(script.weight, 1);
      assert.deepEqual(script.opts, {});
      assert.equal(script.directBuild(noPicks), true);
    });

    it("exposes explicit weight and build options", () => {
      const opts = {
        weight: 0,
        maxSize: 2,
        lazyInit: true,
        cachable: true,
        logCalls: true,
      };
      const script = Script.make("configured", () => 42, opts);
      assert.equal(script.weight, 0);
      assert.deepEqual(script.opts, opts);
    });
  });

  describe("run", () => {
    it("executes the build function with the supplied pick function", () => {
      const bool = Script.make("bool", (pick) => pick(IntRequest.bit) === 1);
      const script = Script.make("run bool", (pick) => bool.run(pick));
      assert.equal(Gen.mustBuild(script, [0]).val, false);
      assert.equal(Gen.mustBuild(script, [1]).val, true);
    });

    it("returns filtered only when the build function throws Filtered", () => {
      const script = Script.make("reject", () => {
        throw new Filtered("try another value");
      });
      assert.equal(script.run(noPicks), filtered);
      assert.throws(() => script.directBuild(noPicks), Filtered);
    });

    it("propagates the original ordinary Error", () => {
      const error = new Error("failed");
      const script = Script.make("fails", () => {
        throw error;
      });
      assert.throws(() => script.run(noPicks), (e) => e === error);
    });
  });

  it("directBuild exposes and executes the original build function", () => {
    const build = (pick: PickFunction) => pick(IntRequest.bit) + 10;
    const script = Script.make("add ten", build);
    assert.strictEqual(script.directBuild, build);
    const direct = Script.make("direct", (pick) => script.directBuild(pick));
    assert.equal(Gen.mustBuild(direct, [0]).val, 10);
    assert.equal(Gen.mustBuild(direct, [1]).val, 11);
  });

  describe("with", () => {
    it("copies options, keeps the build function, and preserves the original", () => {
      const opts = { weight: 2, maxSize: 1, lazyInit: true, logCalls: true };
      const original = Script.make("original", () => true, opts);
      const changed = original.with({
        name: "renamed",
        weight: 0,
        cachable: true,
      });
      assert.notStrictEqual(changed, original);
      assert.notStrictEqual(changed.opts, original.opts);
      assert.strictEqual(changed.directBuild, original.directBuild);
      assert.equal(changed.name, "renamed");
      assert.equal(changed.weight, 0);
      assert.deepEqual(changed.opts, { ...opts, weight: 0, cachable: true });
      assert.equal(changed.run(noPicks), true);
      assert.equal(original.name, "original");
      assert.equal(original.weight, 2);
      assert.equal(original.opts.cachable, undefined);
      assert.deepEqual(original.opts, opts);
    });

    it("preserves omitted options and accepts explicit false and an empty name", () => {
      const original = Script.make("original", () => true, {
        weight: 3,
        cachable: true,
      });
      const changed = original.with({ name: "", cachable: false });
      assert.equal(changed.name, "");
      assert.equal(changed.weight, 3);
      assert.equal(changed.opts.cachable, false);
      assert.equal(original.opts.cachable, true);
      const copy = original.with({});
      assert.notStrictEqual(copy.opts, original.opts);
      assert.deepEqual(copy.opts, original.opts);
      assert.equal(copy.name, original.name);
    });

    it("rejects a negative weight without changing the original", () => {
      const original = Script.make("original", () => true);
      assert.throws(
        () => original.with({ weight: -1 }),
        /weight must be non-negative/,
      );
      assert.equal(original.weight, 1);
      assert.deepEqual(original.opts, {});
    });
  });
});
