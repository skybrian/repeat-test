import { AnyRecord } from "../types.ts";
import Arbitrary, {
  RecordShape as ArbRecordShape,
} from "../arbitrary_class.ts";
import * as arb from "../arbitraries.ts";
import Domain from "../domain_class.ts";

export function from<T>(
  values: T[],
  opts?: { label: string },
): Domain<T> {
  const generator = Arbitrary.from(values, opts);
  const notFoundError = opts?.label
    ? `not a ${generator.label}`
    : "not in the list";
  return new Domain(generator, (val, sendErr) => {
    const pick = values.indexOf(val as T);
    if (pick === -1) {
      sendErr(notFoundError);
      return undefined;
    }
    return [pick];
  });
}

export function of<T>(...values: T[]): Domain<T> {
  return from(values);
}

export const boolean = from([false, true], { label: "boolean" })
  .asFunction();

export function int(min: number, max: number): Domain<number> {
  const gen = arb.int(min, max);

  const accept = (
    val: unknown,
    sendErr: (msg: string) => void,
  ): val is number => {
    if (typeof val !== "number" || !Number.isSafeInteger(val)) {
      sendErr("not a safe integer");
      return false;
    }
    if (val < min || val > max) {
      sendErr(`not in range [${min}, ${max}]`);
      return false;
    }
    return true;
  };

  if (min >= 0) {
    return new Domain(gen, (val, e) => accept(val, e) ? [val] : undefined);
  } else if (max <= 0) {
    return new Domain(gen, (val, e) => accept(val, e) ? [-val] : undefined);
  } else {
    return new Domain(
      gen,
      (val, e) => accept(val, e) ? [val < 0 ? 1 : 0, Math.abs(val)] : undefined,
    );
  }
}

export type RecordShape<T> = {
  [K in keyof T]: Domain<T[K]>;
};

export function record<T extends AnyRecord>(
  fields: RecordShape<T>,
): Domain<T> {
  const fieldKeys = Object.keys(fields) as (keyof T)[];
  const fieldGens: Partial<ArbRecordShape<T>> = {};
  for (const key of fieldKeys) {
    fieldGens[key] = fields[key].generator();
  }
  const gen = arb.record(fieldGens as ArbRecordShape<T>);

  return new Domain(
    gen,
    (val, sendErr) => {
      if (val === null || typeof val !== "object") {
        sendErr("not an object");
        return undefined;
      }
      for (const key of Object.keys(val)) {
        if (!(key in fields)) {
          sendErr(`extra field: ${key}`);
          return undefined;
        }
      }

      const out: number[] = [];
      for (const key of fieldKeys) {
        const fieldVal = val[key as keyof typeof val];
        const picks = fields[key].maybePickify(fieldVal);
        if (!picks.ok) {
          const error = picks.message ?? "invalid field value";
          sendErr(`${key.toString()}: ${error}`);
          return undefined;
        }
        out.push(...picks.val);
      }
      return out;
    },
  );
}

export function array<T>(
  item: Domain<T>,
  opts?: { min?: number; max?: number },
): Domain<T[]> {
  const gen = arb.array(item.generator(), opts);
  const min = opts?.min ?? 0;
  const max = opts?.max ?? arb.defaultArrayLimit;

  const accept = (
    val: unknown,
    sendErr: (msg: string) => void,
  ): val is T[] => {
    if (!Array.isArray(val)) {
      sendErr("not an array");
      return false;
    }
    if (val.length < min || val.length > max) {
      sendErr(`array length not in range [${min}, ${max}]`);
      return false;
    }
    return true;
  };

  return new Domain(gen, (val, sendErr) => {
    if (!accept(val, sendErr)) return undefined;
    const out: number[] = [];

    let i = 0;

    // Fixed-length portion.
    while (i < min) {
      const picks = item.maybePickify(val[i]);
      if (!picks.ok) {
        const err = picks.message ?? "can't pickify array item";
        sendErr(`${i}: ${err}`);
        return undefined;
      }
      out.push(...picks.val);
      i++;
    }

    // Variable-length portion.
    while (i < val.length) {
      const picks = item.maybePickify(val[i]);
      if (!picks.ok) {
        const err = picks.message ?? "can't pickify array item";
        sendErr(`${i}: ${err}`);
        return undefined;
      }
      out.push(1);
      out.push(...picks.val);
      i++;
    }
    if (min < max) {
      out.push(0);
    }
    return out;
  });
}

/**
 * A domain that's the union of the values in each child domain.
 *
 * If the child domains overlap, there will be multiple ways to convert a value
 * into picks. The encoding for the first child that matches will be used when
 * serializing, and any encoding accepted when deserializing.
 */
export function oneOf<T>(cases: Domain<T>[]): Domain<T> {
  if (cases.length === 0) {
    throw new Error("oneOf must have at least one choice");
  } else if (cases.length === 1) {
    return cases[0];
  }

  const gen = arb.oneOf(cases.map((c) => c.generator()));

  return new Domain(gen, (val, sendErr) => {
    for (const [i, c] of cases.entries()) {
      const picks = c.maybePickify(val);
      if (picks.ok) return [i, ...picks.val];
    }
    sendErr("no case matched");
    return undefined;
  });
}
