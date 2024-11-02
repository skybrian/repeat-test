import { dom, type Domain } from "@/mod.ts";

function maybe<T>(d: Domain<T>) {
  return dom.oneOf(dom.of(undefined), d);
}

// Types are defined separately from Domains because type inference doesn't work
// for recursive types.

/** A recursive (non-toplevel) reference to a tsType. */
const innerType: Domain<TsType> = dom.alias(() => tsType);

const typeParamKinds = ["typeRef", "indexedAccess", "keyword"] as const;

export type TypeParam = {
  kind: (typeof typeParamKinds)[number];
  repr: string;
};

export const typeParam = dom.record({
  kind: dom.of(...typeParamKinds),
  repr: dom.string(),
}, { strip: true });

export type TypeRef = {
  typeName: string;
  typeParams: null | TypeParam[];
};

export const typeRef: Domain<TypeRef> = dom.record({
  typeName: dom.string(),
  typeParams: dom.oneOf(dom.of(null), dom.array(typeParam)),
}, { strip: true });

export type Param = {
  name: string | undefined;
};

export const param: Domain<Param> = dom.record({
  name: maybe(dom.string()),
}, { strip: true });

export type FnOrConstructor = {
  params: Param[];
  tsType: TsType;
};

export const fnOrConstructor: Domain<FnOrConstructor> = dom.record({
  params: dom.array(param),
  tsType: innerType,
}, { strip: true });

export type Property = {
  name: string;
  tsType: TsType;
};

export const property: Domain<Property> = dom.record({
  name: dom.string(),
  tsType: innerType,
}, { strip: true });

export type MappedType = {
  typeParam: { name: string };
  tsType: TsType;
};

export const mappedType: Domain<MappedType> = dom.record({
  typeParam: dom.record({
    name: dom.string(),
  }, { strip: true }),
  tsType: innerType,
}, { strip: true });

export type TypeLiteral = {
  properties: Property[];
};

export const typeLiteral: Domain<TypeLiteral> = dom.record({
  properties: dom.array(property),
}, { strip: true });

const typeKinds = [
  "literal",
  "keyword",
  "typeRef",
  "fnOrConstructor",
  "mapped",
  "mappedType",
  "typeOperator",
  "typeLiteral",
  "union",
  "intersection",
  "array",
] as const;

export type TsType = {
  kind: (typeof typeKinds)[number];
  keyword?: string;
  typeRef?: TypeRef;
  fnOrConstructor?: FnOrConstructor;
  mappedType?: MappedType;
  typeLiteral?: TypeLiteral;
  union?: TsType[];
  intersection?: TsType[];
};

export const tsType: Domain<TsType> = dom.record({
  kind: dom.of(...typeKinds),
  keyword: maybe(dom.string()),
  typeRef: maybe(typeRef),
  fnOrConstructor: maybe(fnOrConstructor),
  mappedType: maybe(mappedType),
  typeLiteral: maybe(typeLiteral),
  union: maybe(dom.array(innerType)),
  intersection: maybe(dom.array(innerType)),
}, { strip: true });

export const typeAliasDef = dom.record({
  tsType: tsType,
  typeParams: dom.array(dom.record({
    name: dom.string(),
  }, { strip: true })),
});

export type Constructor = {
  name: string;
  params: Param[];
};

export const constructor: Domain<Constructor> = dom.record({
  name: dom.string(),
  params: dom.array(param),
}, { strip: true });

export type FunctionDef = {
  params: Param[];
  returnType: TsType;
};

export const functionDef: Domain<FunctionDef> = dom.record({
  params: dom.array(param),
  returnType: tsType,
}, { strip: true });

export type Method = {
  name: string;
  functionDef: {
    params: Param[];
    returnType: TsType;
  };
};

export const method: Domain<Method> = dom.record({
  name: dom.string(),
  functionDef,
}, { strip: true });

export const classDef = dom.record({
  isAbstract: dom.boolean(),
  typeParams: dom.array(dom.record({
    name: dom.string(),
  })),
  constructors: dom.array(constructor),
  properties: dom.array(property),
  methods: dom.array(method),
}, { strip: true });

export type InterfaceMethod = {
  name: string;
  params: Param[];
  returnType: TsType;
};

export const interfaceMethod: Domain<InterfaceMethod> = dom.record({
  name: dom.string(),
  params: dom.array(param),
  returnType: tsType,
}, { strip: true });

export const interfaceDef = dom.record({
  typeParams: dom.array(dom.record({ name: dom.string() })),
  callSignatures: dom.array(fnOrConstructor),
  properties: dom.array(property),
  methods: dom.array(interfaceMethod),
}, { strip: true });

export const variableDef = dom.record({
  tsType,
}, { strip: true });

const nodeKinds = [
  "typeAlias",
  "class",
  "interface",
  "function",
  "variable",
  "moduleDoc",
] as const;

export const node = dom.record({
  name: dom.string(),
  kind: dom.of(...nodeKinds),
  typeAliasDef: maybe(typeAliasDef),
  classDef: maybe(classDef),
  interfaceDef: maybe(interfaceDef),
  functionDef: maybe(functionDef),
  variableDef: maybe(variableDef),
}, { strip: true });

/**
 * A partial schema for the JSON printed by `deno doc --json`.
 */
export const schema = dom.record({
  version: dom.int(0, 1000),
  nodes: dom.array(node),
});

export type Schema = ReturnType<typeof schema.parse>;
