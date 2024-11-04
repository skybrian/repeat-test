import { dom, type Domain } from "@/mod.ts";

function maybe<T>(d: Domain<T>) {
  return dom.oneOf(dom.of(undefined), d);
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
  dom.record({ kind: dom.of("typeRef"), repr: dom.string() }),
  dom.record({ kind: dom.of("indexedAccess"), repr: dom.string() }),
  dom.record({ kind: dom.of("keyword"), repr: dom.string() }),
]);

export type TypeRef = {
  typeName: string;
  typeParams: null | TypeParam[];
};

export const typeRef: Domain<TypeRef> = dom.record({
  typeName: dom.string(),
  typeParams: dom.oneOf(dom.of(null), dom.array(typeParam)),
});

export type Param = {
  name: string | undefined;
};

export const param: Domain<Param> = dom.record({
  name: maybe(dom.string()),
});

export type FnOrConstructor = {
  params: Param[];
  tsType: TsType;
};

export const fnOrConstructor: Domain<FnOrConstructor> = dom.record({
  params: dom.array(param),
  tsType: innerType,
});

export type Property = {
  name: string;
  tsType: TsType;
};

export const property: Domain<Property> = dom.record({
  name: dom.string(),
  tsType: innerType,
});

export type MappedType = {
  typeParam: { name: string };
  tsType: TsType;
};

export const mappedType: Domain<MappedType> = dom.record({
  typeParam: dom.record({
    name: dom.string(),
  }),
  tsType: innerType,
});

export type TypeLiteral = {
  properties: Property[];
};

export const typeLiteral: Domain<TypeLiteral> = dom.record({
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
  dom.record({ kind: dom.of("literal") }),
  dom.record({ kind: dom.of("keyword"), keyword: dom.string() }),
  dom.record({ kind: dom.of("typeRef"), typeRef: typeRef }),
  dom.record({
    kind: dom.of("fnOrConstructor"),
    fnOrConstructor: fnOrConstructor,
  }),
  dom.record({ kind: dom.of("mapped"), mappedType: mappedType }),
  dom.record({ kind: dom.of("mappedType") }),
  dom.record({ kind: dom.of("typeOperator") }),
  dom.record({ kind: dom.of("typeLiteral"), typeLiteral: typeLiteral }),
  dom.record({ kind: dom.of("union"), union: dom.array(innerType) }),
  dom.record({
    kind: dom.of("intersection"),
    intersection: dom.array(innerType),
  }),
  dom.record({ kind: dom.of("array") }),
]);

export const typeAliasDef = dom.record({
  tsType: tsType,
  typeParams: dom.array(dom.record({
    name: dom.string(),
  })),
});
export type TypeAliasDef = ReturnType<typeof typeAliasDef.parse>;

export type Constructor = {
  name: string;
  params: Param[];
};

export const constructor: Domain<Constructor> = dom.record({
  name: dom.string(),
  params: dom.array(param),
});

export type FunctionDef = {
  params: Param[];
  returnType: TsType;
};

export const functionDef: Domain<FunctionDef> = dom.record({
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

export const method: Domain<Method> = dom.record({
  name: dom.string(),
  functionDef,
});

export const classDef = dom.record({
  isAbstract: dom.boolean(),
  typeParams: dom.array(dom.record({
    name: dom.string(),
  })),
  constructors: dom.array(constructor),
  properties: dom.array(property),
  methods: dom.array(method),
});

export type ClassDef = ReturnType<typeof classDef.parse>;

export type InterfaceMethod = {
  name: string;
  params: Param[];
  returnType: TsType;
};

export const interfaceMethod: Domain<InterfaceMethod> = dom.record({
  name: dom.string(),
  params: dom.array(param),
  returnType: tsType,
});

export const interfaceDef = dom.record({
  typeParams: dom.array(dom.record({ name: dom.string() })),
  callSignatures: dom.array(fnOrConstructor),
  properties: dom.array(property),
  methods: dom.array(interfaceMethod),
});

export type InterfaceDef = ReturnType<typeof interfaceDef.parse>;

export const variableDef = dom.record({
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

export const node = dom.taggedUnion<Node>("kind", [
  dom.record({
    kind: dom.of("typeAlias"),
    name: dom.string(),
    typeAliasDef: typeAliasDef,
  }),
  dom.record({
    kind: dom.of("class"),
    name: dom.string(),
    classDef: classDef,
  }),
  dom.record({
    kind: dom.of("interface"),
    name: dom.string(),
    interfaceDef: interfaceDef,
  }),
  dom.record({
    kind: dom.of("function"),
    name: dom.string(),
    functionDef: functionDef,
  }),
  dom.record({
    kind: dom.of("variable"),
    name: dom.string(),
    variableDef: variableDef,
  }),
  dom.record({
    kind: dom.of("moduleDoc"),
    name: dom.string(),
    moduleDoc: maybe(dom.string()),
  }),
]);

/**
 * A partial schema for the JSON printed by `deno doc --json`.
 */
export const schema = dom.record({
  version: dom.int(0, 1000),
  nodes: dom.array(node),
});

export type Schema = ReturnType<typeof schema.parse>;
