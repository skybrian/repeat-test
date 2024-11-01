import { dom, type Domain } from "@/mod.ts";

function maybe<T>(d: Domain<T>) {
  return dom.oneOf(dom.of(undefined).with({ name: "undefined" }), d);
}

// Types are defined separately from Domains because type inference doesn't work
// for recursive types.

/** A recursive (non-toplevel) reference to a tsType. */
const innerType: Domain<TsType> = dom.alias(() => tsType);

export type TypeParam = {
  kind: string;
  repr: string;
};

export const typeParam = dom.record({
  kind: dom.string(),
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

export type TsType = {
  kind: string;
  keyword?: string;
  typeRef?: TypeRef;
  fnOrConstructor?: FnOrConstructor;
  mappedType?: MappedType;
  typeLiteral?: TypeLiteral;
};

export const tsType: Domain<TsType> = dom.record({
  kind: dom.string(),
  keyword: maybe(dom.string()),
  typeRef: maybe(typeRef),
  fnOrConstructor: maybe(fnOrConstructor),
  mappedType: maybe(mappedType),
  typeLiteral: maybe(typeLiteral),
}, { strip: true });

export const typeAliasDef = dom.record({
  tsType: tsType,
  typeParams: dom.array(dom.record({
    name: dom.string(),
  })),
});

export type Constructor = {
  name: string;
  params: Param[];
};

export const constructor: Domain<Constructor> = dom.record({
  name: dom.string(),
  params: dom.array(param),
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
  functionDef: dom.record({
    params: dom.array(param),
    returnType: tsType,
  }, { strip: true }),
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

export const interfaceDef = dom.record({
  typeParams: dom.array(dom.record({ name: dom.string() })),
  callSignatures: dom.array(fnOrConstructor),
  properties: dom.array(property),
  methods: dom.array(method),
}, { strip: true });

export const node = dom.record({
  name: dom.string(),
  kind: dom.string(),
  typeAliasDef: maybe(typeAliasDef),
  classDef: maybe(classDef),
  interfaceDef: maybe(interfaceDef),
}, { strip: true });

/**
 * A partial schema for the JSON printed by `deno doc --json`.
 */
export const schema = dom.record({
  version: dom.int(0, 1000),
  nodes: dom.array(node),
});

export type Schema = ReturnType<typeof schema.parse>;
