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
  dom.record({ kind: dom.of("typeRef"), repr: dom.string() }, { strip: true }),
  dom.record({ kind: dom.of("indexedAccess"), repr: dom.string() }, {
    strip: true,
  }),
  dom.record({ kind: dom.of("keyword"), repr: dom.string() }, { strip: true }),
]);

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
  dom.record({ kind: dom.of("literal") }, { strip: true }),
  dom.record({ kind: dom.of("keyword"), keyword: dom.string() }, {
    strip: true,
  }),
  dom.record({ kind: dom.of("typeRef"), typeRef: typeRef }, { strip: true }),
  dom.record({
    kind: dom.of("fnOrConstructor"),
    fnOrConstructor: fnOrConstructor,
  }, { strip: true }),
  dom.record({ kind: dom.of("mapped"), mappedType: mappedType }, {
    strip: true,
  }),
  dom.record({ kind: dom.of("mappedType") }, { strip: true }),
  dom.record({ kind: dom.of("typeOperator") }, { strip: true }),
  dom.record({ kind: dom.of("typeLiteral"), typeLiteral: typeLiteral }, {
    strip: true,
  }),
  dom.record({ kind: dom.of("union"), union: dom.array(innerType) }, {
    strip: true,
  }),
  dom.record({
    kind: dom.of("intersection"),
    intersection: dom.array(innerType),
  }, { strip: true }),
  dom.record({ kind: dom.of("array") }, { strip: true }),
]);

export const typeAliasDef = dom.record({
  tsType: tsType,
  typeParams: dom.array(dom.record({
    name: dom.string(),
  }, { strip: true })),
});
export type TypeAliasDef = ReturnType<typeof typeAliasDef.parse>;

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
}, { strip: true });

export const interfaceDef = dom.record({
  typeParams: dom.array(dom.record({ name: dom.string() })),
  callSignatures: dom.array(fnOrConstructor),
  properties: dom.array(property),
  methods: dom.array(interfaceMethod),
}, { strip: true });

export type InterfaceDef = ReturnType<typeof interfaceDef.parse>;

export const variableDef = dom.record({
  tsType,
}, { strip: true });

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
  }, { strip: true }),
  dom.record({
    kind: dom.of("class"),
    name: dom.string(),
    classDef: classDef,
  }, { strip: true }),
  dom.record({
    kind: dom.of("interface"),
    name: dom.string(),
    interfaceDef: interfaceDef,
  }, { strip: true }),
  dom.record({
    kind: dom.of("function"),
    name: dom.string(),
    functionDef: functionDef,
  }, { strip: true }),
  dom.record({
    kind: dom.of("variable"),
    name: dom.string(),
    variableDef: variableDef,
  }, { strip: true }),
  dom.record({
    kind: dom.of("moduleDoc"),
    name: dom.string(),
    moduleDoc: maybe(dom.string()),
  }, { strip: true }),
]);

/**
 * A partial schema for the JSON printed by `deno doc --json`.
 */
export const schema = dom.record({
  version: dom.int(0, 1000),
  nodes: dom.array(node),
});

export type Schema = ReturnType<typeof schema.parse>;
