import { dom, type Domain, type RowDomain } from "@/mod.ts";
import { object } from "@/doms.ts";

// These types are defined separately from Domains because type inference doesn't work
// for recursive types. Otherwise, we could calculate them using type inference.

// The names match JSON property names, even if it's a little awkward.

/** A JavaScript value that matches itself in a type definition. */
export type Literal = {
  kind: "boolean";
  boolean: boolean;
}; // TODO: more kinds of literals

export type TypeParam =
  | { kind: "typeRef"; repr: string }
  | { kind: "indexedAccess"; repr: string }
  | { kind: "keyword"; repr: string };

/** Refers by name to a type defined elsewhere. */
export type TypeRef = {
  typeName: string;
  typeParams: null | TypeParam[];
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

/** A property appearing in a class, interface, or object type. */
export type Property = {
  name: string;
  tsType: TsType;
};

/** An object type such as `{ a: string, b: number }` */
export type TypeLiteral = {
  properties: Property[];
};

export type TsType =
  | { kind: "literal"; literal: Literal }
  | { kind: "keyword"; keyword: string }
  | { kind: "typeRef"; typeRef: TypeRef }
  | { kind: "fnOrConstructor"; fnOrConstructor: FnOrConstructor }
  | { kind: "mapped"; mappedType: MappedType }
  | { kind: "mappedType" }
  | { kind: "typeOperator" }
  | { kind: "typeLiteral"; typeLiteral: TypeLiteral }
  | { kind: "union"; union: TsType[] }
  | { kind: "intersection"; intersection: TsType[] }
  | { kind: "array"; array: TsType }
  | { kind: "parenthesized"; parenthesized: TsType };

/** A top-level type definition. */
export type TypeAliasDef = {
  tsType: TsType;
  typeParams: { name: string }[];
};

/** A top-level function definition. */
export type FunctionDef = {
  params: Param[];
  returnType: TsType;
};

/** A constructor appearing in a class. */
export type Constructor = {
  name: string;
  params: Param[];
};

/** A method appearing in a class. */
export type Method = {
  name: string;
  functionDef: {
    params: Param[];
    returnType: TsType;
  };
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
    kind: "moduleDoc";
    name: string;
    moduleDoc?: string;
  };

/** A schema for the JSON printed by `deno doc --json`. */
export type DenoDoc = {
  version: 1;
  nodes: Node[];
};

//

function maybe<T>(d: Domain<T>) {
  return dom.firstOf(dom.of(undefined), d);
}

const literal: Domain<Literal> = dom.taggedUnion("kind", [
  dom.object({ kind: dom.of("boolean"), boolean: dom.boolean() }),
]);

/** A recursive (non-toplevel) reference to a tsType. */
const innerType: Domain<TsType> = dom.alias(() => tsType);

export const typeParam = dom.taggedUnion<TypeParam>("kind", [
  object({ kind: dom.of("typeRef"), repr: dom.string() }),
  object({ kind: dom.of("indexedAccess"), repr: dom.string() }),
  object({ kind: dom.of("keyword"), repr: dom.string() }),
]);

export const typeRef: Domain<TypeRef> = object({
  typeName: dom.string(),
  typeParams: dom.firstOf(dom.of(null), dom.array(typeParam)),
});

export const innerParam: Domain<Param> = dom.alias(() => param);

export const param: Domain<Param> = dom.taggedUnion<Param>("kind", [
  object({ kind: dom.of("identifier"), name: dom.string() }),
  object({ kind: dom.of("rest"), arg: innerParam }),
]);

export const fnOrConstructor: Domain<FnOrConstructor> = object({
  params: dom.array(param),
  tsType: innerType,
});

export const property: RowDomain<Property> = object({
  name: dom.string(),
  tsType: innerType,
});

export const mappedType: Domain<MappedType> = object({
  typeParam: object({
    name: dom.string(),
  }),
  tsType: innerType,
});

export const typeLiteral: Domain<TypeLiteral> = object({
  properties: dom.array(property),
});

export const tsType: Domain<TsType> = dom.taggedUnion<TsType>("kind", [
  object({ kind: dom.of("literal"), literal }),
  object({ kind: dom.of("keyword"), keyword: dom.string() }),
  object({ kind: dom.of("typeRef"), typeRef: typeRef }),
  object({
    kind: dom.of("fnOrConstructor"),
    fnOrConstructor: fnOrConstructor,
  }),
  object({ kind: dom.of("mapped"), mappedType: mappedType }),
  object({ kind: dom.of("mappedType") }),
  object({ kind: dom.of("typeOperator") }),
  object({ kind: dom.of("typeLiteral"), typeLiteral: typeLiteral }),
  object({ kind: dom.of("union"), union: dom.array(innerType) }),
  object({
    kind: dom.of("intersection"),
    intersection: dom.array(innerType),
  }),
  object({ kind: dom.of("array"), array: innerType }),
  object({
    kind: dom.of("parenthesized"),
    parenthesized: innerType,
  }),
]);

export const typeAliasDef = object({
  tsType: tsType,
  typeParams: dom.array(object({
    name: dom.string(),
  })),
});

export const constructor: Domain<Constructor> = object({
  name: dom.string(),
  params: dom.array(param),
});

export const functionDef: Domain<FunctionDef> = object({
  params: dom.array(param),
  returnType: tsType,
});

export const method: RowDomain<Method> = object({
  name: dom.string(),
  functionDef,
});

export const classDef = object({
  isAbstract: dom.boolean(),
  typeParams: dom.table(
    object({ name: dom.string() }),
    { keys: ["name"] },
  ),
  constructors: dom.array(constructor),
  properties: dom.table(property, { keys: ["name"] }),
  methods: dom.array(method), // multiple method signatures are possible
});

export const interfaceMethod: RowDomain<InterfaceMethod> = object({
  name: dom.string(),
  params: dom.array(param),
  returnType: tsType,
});

export const interfaceDef = object({
  typeParams: dom.table(dom.object({ name: dom.string() }), { keys: ["name"] }),
  callSignatures: dom.array(fnOrConstructor),
  properties: dom.table(property, { keys: ["name"] }),
  methods: dom.table(interfaceMethod, { keys: ["name"] }),
});

export const variableDef = object({
  tsType,
});

const name = dom.string();

export const node = dom.taggedUnion<Node>("kind", [
  object({
    kind: dom.of("typeAlias"),
    name,
    typeAliasDef: typeAliasDef,
  }),
  object({
    kind: dom.of("class"),
    name,
    classDef: classDef,
  }),
  object({
    kind: dom.of("interface"),
    name,
    interfaceDef: interfaceDef,
  }),
  object({
    kind: dom.of("function"),
    name,
    functionDef: functionDef,
  }),
  object({
    kind: dom.of("variable"),
    name,
    variableDef: variableDef,
  }),
  object({
    kind: dom.of("moduleDoc"),
    name,
    moduleDoc: maybe(dom.string()),
  }),
]);

/**
 * A partial schema for the JSON printed by `deno doc --json`.
 */
export const denoDoc: Domain<DenoDoc> = object({
  version: dom.of(1),
  nodes: dom.table(node, { keys: ["name"] }),
});
