import { dom, type Domain, type RowDomain } from "@/mod.ts";
import { object } from "@/doms.ts";

function maybe<T>(d: Domain<T>) {
  return dom.firstOf(dom.of(undefined), d);
}

// Types are defined separately from Domains because type inference doesn't work
// for recursive types.

/** A recursive (non-toplevel) reference to a tsType. */
const innerType: Domain<TsType> = dom.alias(() => tsType);

export type TypeParam =
  | { kind: "typeRef"; repr: string }
  | { kind: "indexedAccess"; repr: string }
  | { kind: "keyword"; repr: string };

export const typeParam = dom.taggedUnion<TypeParam>("kind", [
  object({ kind: dom.of("typeRef"), repr: dom.string() }),
  object({ kind: dom.of("indexedAccess"), repr: dom.string() }),
  object({ kind: dom.of("keyword"), repr: dom.string() }),
]);

export type TypeRef = {
  typeName: string;
  typeParams: null | TypeParam[];
};

export const typeRef: Domain<TypeRef> = object({
  typeName: dom.string(),
  typeParams: dom.firstOf(dom.of(null), dom.array(typeParam)),
});

export type Param = {
  name: string | undefined;
};

export const param: Domain<Param> = object({
  name: maybe(dom.string()),
});

export type FnOrConstructor = {
  params: Param[];
  tsType: TsType;
};

export const fnOrConstructor: Domain<FnOrConstructor> = object({
  params: dom.array(param),
  tsType: innerType,
});

export type Property = {
  name: string;
  tsType: TsType;
};

export const property: RowDomain<Property> = object({
  name: dom.string(),
  tsType: innerType,
});

export type MappedType = {
  typeParam: { name: string };
  tsType: TsType;
};

export const mappedType: Domain<MappedType> = object({
  typeParam: object({
    name: dom.string(),
  }),
  tsType: innerType,
});

export type TypeLiteral = {
  properties: Property[];
};

export const typeLiteral: Domain<TypeLiteral> = object({
  properties: dom.array(property),
});

export type TsType =
  | { kind: "literal" }
  | { kind: "keyword"; keyword: string }
  | { kind: "typeRef"; typeRef: TypeRef }
  | { kind: "fnOrConstructor"; fnOrConstructor: FnOrConstructor }
  | { kind: "mapped"; mappedType: MappedType }
  | { kind: "mappedType" }
  | { kind: "typeOperator" }
  | { kind: "typeLiteral"; typeLiteral: TypeLiteral }
  | { kind: "union"; union: TsType[] }
  | { kind: "intersection"; intersection: TsType[] }
  | { kind: "array" };

export const tsType: Domain<TsType> = dom.taggedUnion<TsType>("kind", [
  object({ kind: dom.of("literal") }),
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
  object({ kind: dom.of("array") }),
]);

export const typeAliasDef = object({
  tsType: tsType,
  typeParams: dom.array(object({
    name: dom.string(),
  })),
});
export type TypeAliasDef = ReturnType<typeof typeAliasDef.parse>;

export type Constructor = {
  name: string;
  params: Param[];
};

export const constructor: Domain<Constructor> = object({
  name: dom.string(),
  params: dom.array(param),
});

export type FunctionDef = {
  params: Param[];
  returnType: TsType;
};

export const functionDef: Domain<FunctionDef> = object({
  params: dom.array(param),
  returnType: tsType,
});

export type Method = {
  name: string;
  functionDef: {
    params: Param[];
    returnType: TsType;
  };
};

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

export type ClassDef = ReturnType<typeof classDef.parse>;

export type InterfaceMethod = {
  name: string;
  params: Param[];
  returnType: TsType;
};

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

export type InterfaceDef = ReturnType<typeof interfaceDef.parse>;

export const variableDef = object({
  tsType,
});

export type VariableDef = ReturnType<typeof variableDef.parse>;

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
export const schema = object({
  version: dom.int(0, 1000),
  nodes: dom.table(node, { keys: ["name"] }),
});

export type Schema = ReturnType<typeof schema.parse>;
