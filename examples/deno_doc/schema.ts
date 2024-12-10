import type { Domain, Row, RowDomain } from "@/mod.ts";
import { dom } from "@/mod.ts";
import { object } from "@/doms.ts";

// These types are defined separately from Domains because type inference doesn't work
// for recursive types. Otherwise, we could calculate them using type inference.

// The names match JSON property names, even if it's a little awkward.

/** A JavaScript value that matches itself in a type definition. */
export type Literal = {
  kind: "boolean";
  boolean: boolean;
}; // TODO: more kinds of literals

/** Refers by name to a type defined elsewhere. */
export type TypeRef = {
  typeName: string;
  typeParams: null | TsType[];
};

/** A constructor, function, or method parameter. */
export type Param =
  | { kind: "identifier"; name: string }
  | { kind: "rest"; arg: Param };

/** The type of a function or constructor. */
export type FnOrConstructor = {
  params: Param[];
  /** Return type. */
  tsType: TsType;
};

export type MappedType = {
  typeParam: { name: string };
  tsType: TsType;
};

/** A reference to a property type like T[K] */
export type IndexedAccess = {
  objType: TsType;
  indexType: TsType;
};

/** A property appearing in a class, interface, or object type. */
export type Property = {
  name: string;
  tsType: TsType | null;
};

/** An object type such as `{ a: string, b: number }` */
export type TypeLiteral = {
  properties: Property[];
};

export type TypePredicate = {
  param: { type: "identifier"; name: string };
  type: TsType;
};

export type TsType =
  | { kind: "literal"; literal: Literal }
  | { kind: "keyword"; keyword: string }
  | { kind: "typeRef"; typeRef: TypeRef }
  | { kind: "fnOrConstructor"; fnOrConstructor: FnOrConstructor }
  | { kind: "mapped"; mappedType: MappedType }
  | { kind: "mappedType" }
  | { kind: "indexedAccess"; indexedAccess: IndexedAccess }
  | { kind: "typeOperator" }
  | { kind: "typeLiteral"; typeLiteral: TypeLiteral }
  | { kind: "union"; union: TsType[] }
  | { kind: "intersection"; intersection: TsType[] }
  | { kind: "array"; array: TsType }
  | { kind: "parenthesized"; parenthesized: TsType }
  | { kind: "typeQuery" }
  | { kind: "typePredicate"; typePredicate: TypePredicate };

/** A top-level type definition. */
export type TypeAliasDef = {
  tsType: TsType;
  typeParams: { name: string }[];
};

/** A function definition. (Also used in a method.) */
export type FunctionDef = {
  params: Param[];
  returnType: TsType | null;
};

/** A constructor appearing in a class. */
export type Constructor = {
  name: string;
  params: Param[];
};

/** A method appearing in a class. */
export type Method = {
  name: string;
  functionDef: FunctionDef;
};

/** A top-level class definition. */
export type ClassDef = {
  isAbstract: boolean;
  typeParams: { name: string }[];
  constructors: Constructor[];
  properties: Property[];
  methods: Method[];
};

/** A method appearing in an interface. */
export type InterfaceMethod = {
  name: string;
  params: Param[];
  returnType: TsType;
};

/** A top-level interface definition. */
export type InterfaceDef = {
  typeParams: { name: string }[];
  callSignatures: FnOrConstructor[];
  properties: Property[];
  methods: InterfaceMethod[];
};

/** A top-level variable definition. */
export type VariableDef = {
  tsType: TsType;
};

/** A top-level defintion appearing in a file. */
export type Node =
  | {
    kind: "typeAlias";
    name: string;
    typeAliasDef: TypeAliasDef;
  }
  | {
    kind: "class";
    name: string;
    classDef: ClassDef;
  }
  | {
    kind: "interface";
    name: string;
    interfaceDef: InterfaceDef;
  }
  | {
    kind: "function";
    name: string;
    functionDef: FunctionDef;
  }
  | {
    kind: "variable";
    name: string;
    variableDef: VariableDef;
  }
  | {
    kind: "namespace";
    name: string;
  }
  | {
    kind: "moduleDoc";
    name: string;
    moduleDoc?: string;
  };

/** A schema for the JSON printed by `deno doc --json`. */
export type DenoDoc = {
  version: 1;
  nodes: Node[];
};

function maybe<T>(d: Domain<T>) {
  return dom.firstOf(dom.of(undefined), d);
}

function maybeNull<T>(d: Domain<T>) {
  return dom.firstOf(dom.of(null).with({ weight: 0.2 }), d);
}

/**
 * Overridable options when creating a DenoDoc schema.
 *
 * By default, any string is allowed, which is suitable for parsing JSON.
 *
 * But it can be overridden to generate random identifiers that are friendlier.
 * (For example, only short ASCII strings.)
 */
export type DenoDocSchemaOpts = {
  /**
   * An identifier used for a type. (Typically uppercase.)
   */
  typeName?: Domain<string>;

  /**
   * An identifier used as a type parameter (often a single uppercase letter).
   */
  typeParamName?: Domain<string>;

  /**
   * The domain to be used for JavaScript identifiers. (Typically lowercase.)
   */
  valName?: Domain<string>;

  /**
   * Freeform text, such as documentation.
   */
  text?: Domain<string>;

  /** The maximum number of parameters, properties, methods, etc in a node. */
  maxItems?: number;
};

/**
 * Creates a schema for 'deno doc --json' with the given options.
 */
export function makeDenoDocSchema(opts?: DenoDocSchemaOpts) {
  const typeName = opts?.typeName ?? dom.string();
  const typeParamName = opts?.typeParamName ?? dom.string();
  const valName = opts?.valName ?? dom.string();
  const text = opts?.text ?? dom.string();

  const maxItems = opts?.maxItems;

  function array<T>(item: Domain<T>): Domain<T[]> {
    return dom.array(item, { length: { max: maxItems } });
  }

  function table<T extends Row>(item: RowDomain<T>): Domain<T[]> {
    return dom.table(item, { length: { max: maxItems }, keys: ["name"] });
  }

  const literal: Domain<Literal> = dom.taggedUnion<Literal>("kind", [
    dom.object({ kind: dom.of("boolean"), boolean: dom.boolean() }),
  ]).with({ name: "literal" });

  /** A recursive (non-toplevel) reference to a tsType. */
  const innerType: Domain<TsType> = dom.alias(() => tsType);

  const typeRef: Domain<TypeRef> = object({
    typeName,
    typeParams: dom.firstOf(
      dom.of(null).with({ weight: 3 }),
      array(innerType),
    ),
  });

  const innerParam: Domain<Param> = dom.alias(() => param);

  const param: Domain<Param> = dom.taggedUnion<Param>("kind", [
    object({ kind: dom.of("identifier"), name: valName }),
    object<Param>({ kind: dom.of("rest"), arg: innerParam }).with({
      weight: 0.1,
    }),
  ]);

  const params = array(param);

  const fnOrConstructor: Domain<FnOrConstructor> = object({
    params,
    tsType: innerType,
  });

  const property: RowDomain<Property> = object({
    name: valName,
    tsType: maybeNull(innerType),
  });

  const mappedType: Domain<MappedType> = object({
    typeParam: object({
      name: typeParamName,
    }),
    tsType: innerType,
  });

  const indexedAccess: Domain<IndexedAccess> = object({
    objType: innerType,
    indexType: innerType,
  });

  const typeLiteral: Domain<TypeLiteral> = object({
    properties: array(property),
  });

  const typePredicate: Domain<TypePredicate> = object({
    param: object({ type: dom.of("identifier"), name: valName }),
    type: innerType,
  });

  const tsType: Domain<TsType> = dom.taggedUnion<TsType>("kind", [
    object({ kind: dom.of("literal"), literal }),
    object({
      kind: dom.of("keyword"),
      keyword: valName, // TODO: actual keywords
    }),
    object<TsType>({ kind: dom.of("typeRef"), typeRef }).with({ weight: 10 }),
    object({
      kind: dom.of("fnOrConstructor"),
      fnOrConstructor,
    }),
    object({ kind: dom.of("mapped"), mappedType }),
    object({ kind: dom.of("mappedType") }),
    object({
      kind: dom.of("indexedAccess"),
      indexedAccess,
    }),
    object({ kind: dom.of("typeOperator") }),
    object({ kind: dom.of("typeLiteral"), typeLiteral }),
    object({ kind: dom.of("union"), union: array(innerType) }),
    object({
      kind: dom.of("intersection"),
      intersection: array(innerType),
    }),
    object({ kind: dom.of("array"), array: innerType }),
    object({
      kind: dom.of("parenthesized"),
      parenthesized: innerType,
    }),
    object({ kind: dom.of("typeQuery") }), // TODO: more fields
    object({ kind: dom.of("typePredicate"), typePredicate }),
  ]).with({ name: "tsType" });

  const typeAliasDef = object({
    tsType,
    typeParams: table(object({ name: typeParamName })),
  });

  const construct: Domain<Constructor> = object({
    name: valName,
    params,
  });

  const functionDef: Domain<FunctionDef> = object({
    params,
    returnType: maybeNull(tsType),
  });

  const method: RowDomain<Method> = object({
    name: valName,
    functionDef: functionDef,
  });

  const classDef = object({
    isAbstract: dom.boolean(),
    typeParams: table(
      object({ name: typeParamName }),
    ),
    constructors: array(construct),
    properties: table(property),
    methods: array(method), // multiple method signatures are possible
  });

  const interfaceMethod: RowDomain<InterfaceMethod> = object({
    name: typeName,
    params,
    returnType: tsType,
  });

  const interfaceDef = object({
    typeParams: dom.table(dom.object({ name: typeParamName }), {
      keys: ["name"],
    }),
    callSignatures: dom.array(fnOrConstructor),
    properties: dom.table(property, { keys: ["name"] }),
    methods: dom.table(interfaceMethod, { keys: ["name"] }),
  });

  const variableDef = object({ tsType });

  const node = dom.taggedUnion<Node>("kind", [
    object({
      kind: dom.of("typeAlias"),
      name: typeName,
      typeAliasDef,
    }),
    object({
      kind: dom.of("class"),
      name: typeName,
      classDef,
    }),
    object({
      kind: dom.of("interface"),
      name: typeName,
      interfaceDef,
    }),
    object({
      kind: dom.of("function"),
      name: valName,
      functionDef,
    }),
    object({
      kind: dom.of("variable"),
      name: valName,
      variableDef,
    }),
    object({
      kind: dom.of("moduleDoc"),
      name: valName,
      moduleDoc: maybe(text),
    }),
    object({
      kind: dom.of("namespace"),
      name: valName,
      // TODO: more fields
    }),
  ]).with({ name: "Node" });

  const denoDoc: Domain<DenoDoc> = object({
    version: dom.of(1),
    nodes: dom.table(node, { keys: { "name": dom.string() } }),
  });

  return denoDoc;
}

/**
 * A partial schema for the JSON printed by `deno doc --json`.
 */
export const denoDoc: Domain<DenoDoc> = makeDenoDocSchema();
