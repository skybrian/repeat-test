import type { BuildFunction, HasScript, Pickable } from "@/arbitrary.ts";
import type { Failure, Success } from "./results.ts";

import { assertEquals } from "@std/assert";
import { Arbitrary, Gen, Script } from "@/arbitrary.ts";
import { failure, success } from "./results.ts";
import { generateDefault } from "./ordered.ts";

import type { SendErr } from "./options.ts";

/** Thrown for validation errors. */
export class ParseError<T> extends Error {
  /** Creates a ParseError with the actual value attached. */
  constructor(message: string, readonly actual: T) {
    super(message);
    this.name = "ParseError";
  }
}

/**
 * Validates a value, converting it to a pick sequence that can be used to make
 * a copy of it.
 *
 * If the value is valid, returns an array of picks. Otherwise, returns
 * undefined. Validation errors can be reported using sendErr.
 *
 * The third argument is the name of the Domain.
 */
export type PickifyFunction = (
  val: unknown,
  sendErr: SendErr,
  name: string,
) => Iterable<number> | undefined;

/**
 * A Domain represents a set of JavaScript values that can be both validated and
 * generated.
 *
 * When validating, it takes a value and attempts to convert it into an array of
 * integers (a pick sequence). It contains an Arbitrary that does the opposite
 * operation, converting from picks to values.
 *
 * The mapping between pick sequences and values doesn't have to be one-to-one.
 * The pick sequence that a Domain generates when it parses a value is
 * "canonical" for that value, but it could accept other pick sequences that map
 * to the same value.
 *
 * Similarly, a Domain might accept (convert) more values than it can generate,
 * but only values that it both accepts and generates are considered members of
 * the Domain.
 */
export class Domain<T> implements Pickable<T>, HasScript<T> {
  #script: Script<T>;
  #pickify: PickifyFunction;

  private constructor(
    script: Script<T>,
    pickify: PickifyFunction,
    lazyInit: boolean,
  ) {
    this.#script = script;
    this.#pickify = pickify;

    if (!lazyInit) {
      // Verify that we can round-trip the default value.
      const def = generateDefault(script);
      const picks = this.pickify(
        def.val,
        "callback returned undefined",
      );
      if (!picks.ok) {
        throw new Error(
          `can't pickify default of ${script.name}: ${picks.message}`,
        );
      }
      assertEquals(
        Array.from(def.replies),
        picks.val,
        `callback's picks don't match for the default value of ${script.name}`,
      );
    }
  }

  get name(): string {
    return this.#script.name;
  }

  get directBuild(): BuildFunction<T> {
    return this.#script.directBuild;
  }

  get buildScript(): Script<T> {
    return this.#script;
  }

  /**
   * Validates a value, returning a copy created by regenerating it.
   *
   * @throws an Error if the value is not a member of this domain.
   */
  parse(val: unknown): T {
    const gen = this.regenerate(val);
    if (!gen.ok) {
      let msg = gen.message;
      if (!msg.endsWith("\n")) {
        msg += "\n";
      }
      const actual = Deno.inspect(gen.actual);
      throw new ParseError(`${msg}\n${actual}\n`, val);
    }
    return gen.val;
  }

  /**
   * Returns a new domain with only the values accepted by a predicate.
   */
  filter(accept: (val: T) => boolean): Domain<T> {
    const gen = Arbitrary.from(this).filter(accept);

    return Domain.make<T>(gen, (val, sendErr) => {
      const gen = this.regenerate(val);
      if (!gen.ok) {
        sendErr(gen.message, val);
        return undefined;
      }
      if (!accept(gen.val)) {
        sendErr("filter rejected value", val);
        return undefined;
      }
      return gen.replies;
    });
  }

  /**
   * Validates a value, returning a copy and the picks used to generate it.
   */
  regenerate(val: unknown): Gen<T> | Failure {
    const picks = this.pickify(val);
    if (!picks.ok) {
      return picks;
    }
    return Gen.build(this.buildScript, picks.val);
  }

  /**
   * Given some picks, attempts to generate the corresponding value.
   */
  generate(replies: Iterable<number>): Gen<T> | Failure {
    return Gen.build(this.buildScript, replies);
  }

  /**
   * Validates a value, returning an array of picks that could be used to create
   * a copy of it.
   *
   * If the value isn't accepted by this domain, returns a Failure instead.
   *
   * @param defaultMessage an error message to use when the Domain doesn't
   * report a more specific error.
   *
   * (When implementing a Domain, use {@link innerPickify} instead.)
   */
  pickify(
    val: unknown,
    defaultMessage?: string,
  ): Success<number[]> | Failure {
    let firstFailure: Failure | undefined;
    const sendErr: SendErr = (msg, actual, opts) => {
      if (firstFailure === undefined) {
        const at = opts?.at;
        const firstMsg = at !== undefined ? `${at}: ${msg}` : msg;
        firstFailure = failure(firstMsg, actual);
      }
    };
    const picks = this.#pickify(val, sendErr, this.name);
    if (picks === undefined) {
      return firstFailure ?? failure(defaultMessage ?? "not in domain", val);
    }
    return success(Array.from(picks));
  }

  /**
   * Returns the picks that encode a value, or undefined if the value isn't a
   * member of the domain.
   *
   * If undefined is returned, errors might be reported by calling
   * {@link sendErr}.
   *
   * If a location is supplied, it will be prepended to inner locations.
   *
   * (This function is designed to be convenient to use within a
   * {@link PickifyFunction}.)
   */
  innerPickify(
    val: unknown,
    sendErr: SendErr,
    location?: number | string,
  ): Iterable<number> | undefined {
    let innerErr: SendErr = sendErr;
    if (location !== undefined) {
      innerErr = (msg, val, opts) => {
        const innerAt = opts?.at;
        const at = innerAt ? `${location}.${innerAt}` : "" + location;
        sendErr(msg, val, { at });
      };
    }
    return this.#pickify(val, innerErr, this.name);
  }

  /**
   * Returns a copy of the Domain with a different name.
   */
  with(opts: { name: string }): Domain<T> {
    const script = this.buildScript.with(opts);
    return new Domain(script, this.#pickify, true);
  }

  /**
   * Converts the domain to a zero-argument function.
   *
   * (Defining a function instead of a constant is useful for forward
   * compatibility, in case you might want to add optional arguments later.)
   */
  asFunction(): () => Domain<T> {
    return () => this;
  }

  /**
   * A short string describing this Arbitrary, for debugging.
   */
  toString(): string {
    return `${this.constructor.name}('${this.name}')`;
  }

  /**
   * Constructs a Domain that accepts the same values a Pickable.
   *
   * The callback should accept all values generated by the Arbitrary, and it
   * should generate picks that the Arbitrary can convert back to the original
   * value. (Round-tripping is used in {@link regenerate} and {@link parse}).
   *
   * A property test can be used to verify that the callback is correct.
   */
  static make<T>(
    gen: Pickable<T>,
    pickify: PickifyFunction,
    opts?: { lazyInit?: boolean },
  ): Domain<T> {
    return new Domain(Script.from(gen), pickify, opts?.lazyInit ?? false);
  }

  /**
   * Defines a domain that accepts only values equal to the given arguments.
   *
   * Comparisons are done using strict equality, the same algorithm used by
   * `===`.
   */
  static of<T>(...values: T[]): Domain<T> {
    const generator = Arbitrary.of(...values);

    if (values.length === 1) {
      return Domain.make(generator, (val, sendErr, name) => {
        if (val !== values[0]) {
          sendErr(`doesn't match '${name}'`, val);
          return undefined;
        }
        return []; // constant
      });
    }

    return Domain.make(generator, (val, sendErr, name) => {
      const pick = values.indexOf(val as T);
      if (pick === -1) {
        sendErr(`not a member of '${name}': ${Deno.inspect(val)}`, val);
        return undefined;
      }
      return [pick];
    });
  }

  /**
   * Returns a Domain that stands for another Domain, which might be
   * defined later.
   *
   * Since initialization is lazy, this is useful for parsing recursive types.
   *
   * Usually, the return type must be declared when definining an alias, because
   * TypeScript's type inference doesn't work for recursive types.
   */
  static alias<T>(
    init: () => Domain<T>,
  ): Domain<T> {
    let cache: Domain<T> | undefined;

    function target() {
      if (cache === undefined) {
        cache = init();
      }
      return cache;
    }

    const script = Script.make("alias", (pick) => {
      return target().directBuild(pick);
    }, { lazyInit: true });

    function pickify(
      val: unknown,
      sendErr: SendErr,
    ): Iterable<number> | undefined {
      const dom = target();
      return dom.#pickify(val, sendErr, dom.name);
    }

    return new Domain(script, pickify, true);
  }
}
