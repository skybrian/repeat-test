import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { frozen } from "@skybrian/repeat-test";

describe("frozen", () => {
  it("returns primitives unchanged", () => {
    strictEqual(frozen(null), null);
    strictEqual(frozen(undefined), undefined);
    strictEqual(frozen(42), 42);
    strictEqual(frozen("hello"), "hello");
    strictEqual(frozen(true), true);
  });

  it("freezes a simple object", () => {
    const obj = { a: 1, b: 2 };
    const result = frozen(obj);
    strictEqual(result, obj);
    strictEqual(Object.isFrozen(result), true);
  });

  it("freezes nested objects", () => {
    const obj = { outer: { inner: { deep: 1 } } };
    const result = frozen(obj);
    strictEqual(Object.isFrozen(result), true);
    strictEqual(Object.isFrozen(result.outer), true);
    strictEqual(Object.isFrozen(result.outer.inner), true);
  });

  it("freezes arrays", () => {
    const arr = [1, 2, 3];
    const result = frozen(arr);
    strictEqual(Object.isFrozen(result), true);
  });

  it("freezes arrays with objects", () => {
    const arr = [{ a: 1 }, { b: 2 }];
    const result = frozen(arr);
    strictEqual(Object.isFrozen(result), true);
    strictEqual(Object.isFrozen(result[0]), true);
    strictEqual(Object.isFrozen(result[1]), true);
  });

  it("freezes objects with arrays", () => {
    const obj = { items: [{ x: 1 }, { x: 2 }] };
    const result = frozen(obj);
    strictEqual(Object.isFrozen(result), true);
    strictEqual(Object.isFrozen(result.items), true);
    strictEqual(Object.isFrozen(result.items[0]), true);
  });

  it("returns already frozen objects as-is", () => {
    const obj = Object.freeze({ a: 1 });
    const result = frozen(obj);
    strictEqual(result, obj);
  });

  it("handles mixed frozen and unfrozen nested objects", () => {
    const inner = Object.freeze({ x: 1 });
    const obj = { frozen: inner, unfrozen: { y: 2 } };
    const result = frozen(obj);
    strictEqual(Object.isFrozen(result), true);
    strictEqual(Object.isFrozen(result.frozen), true);
    strictEqual(Object.isFrozen(result.unfrozen), true);
  });
});
