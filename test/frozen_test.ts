import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { frozen } from "../src/frozen.ts";

describe("frozen", () => {
  it("returns primitives unchanged", () => {
    assertEquals(frozen(null), null);
    assertEquals(frozen(undefined), undefined);
    assertEquals(frozen(42), 42);
    assertEquals(frozen("hello"), "hello");
    assertEquals(frozen(true), true);
  });

  it("freezes a simple object", () => {
    const obj = { a: 1, b: 2 };
    const result = frozen(obj);
    assertEquals(result, obj);
    assertEquals(Object.isFrozen(result), true);
  });

  it("freezes nested objects", () => {
    const obj = { outer: { inner: { deep: 1 } } };
    const result = frozen(obj);
    assertEquals(Object.isFrozen(result), true);
    assertEquals(Object.isFrozen(result.outer), true);
    assertEquals(Object.isFrozen(result.outer.inner), true);
  });

  it("freezes arrays", () => {
    const arr = [1, 2, 3];
    const result = frozen(arr);
    assertEquals(Object.isFrozen(result), true);
  });

  it("freezes arrays with objects", () => {
    const arr = [{ a: 1 }, { b: 2 }];
    const result = frozen(arr);
    assertEquals(Object.isFrozen(result), true);
    assertEquals(Object.isFrozen(result[0]), true);
    assertEquals(Object.isFrozen(result[1]), true);
  });

  it("freezes objects with arrays", () => {
    const obj = { items: [{ x: 1 }, { x: 2 }] };
    const result = frozen(obj);
    assertEquals(Object.isFrozen(result), true);
    assertEquals(Object.isFrozen(result.items), true);
    assertEquals(Object.isFrozen(result.items[0]), true);
  });

  it("returns already frozen objects as-is", () => {
    const obj = Object.freeze({ a: 1 });
    const result = frozen(obj);
    assertEquals(result, obj);
  });

  it("handles mixed frozen and unfrozen nested objects", () => {
    const inner = Object.freeze({ x: 1 });
    const obj = { frozen: inner, unfrozen: { y: 2 } };
    const result = frozen(obj);
    assertEquals(Object.isFrozen(result), true);
    assertEquals(Object.isFrozen(result.frozen), true);
    assertEquals(Object.isFrozen(result.unfrozen), true);
  });
});
