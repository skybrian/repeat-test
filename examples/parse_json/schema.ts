import { dom, type Domain } from "@/mod.ts";

function maybe<T>(d: Domain<T>) {
  return dom.oneOf(dom.of(undefined).with({ name: "undefined" }), d);
}

export const typeParam = dom.record({
  kind: dom.string(),
  repr: dom.string(),
}, { strip: true });

export const typeRef = dom.record({
  typeName: dom.string(),
  typeParams: dom.oneOf(dom.of(null), dom.array(typeParam)),
}, { strip: true });

export const param = dom.record({
  name: maybe(dom.string()),
}, { strip: true });

// This should be the same as tsType, but Domain doesn't support recursive types yet.
export const retType = dom.record({
  kind: dom.string(),
  keyword: maybe(dom.string()),
  typeRef: maybe(typeRef),
}, { strip: true });

export const fnOrConstructor = dom.record({
  params: dom.array(param),
  tsType: retType,
}, { strip: true });

// This should be the same as tsType, but Domain doesn't support recursive types yet.
export const propType = dom.record({
  kind: dom.string(),
  keyword: maybe(dom.string()),
  typeRef: maybe(typeRef),
  fnOrConstructor: maybe(fnOrConstructor),
}, { strip: true });

export const property = dom.record({
  name: dom.string(),
  tsType: propType,
}, { strip: true });

export const mappedType = dom.record({
  typeParam: dom.record({
    name: dom.string(),
  }, { strip: true }),
  tsType: propType,
}, { strip: true });

export const typeLiteral = dom.record({
  properties: dom.array(property),
}, { strip: true });

export const tsType = dom.record({
  kind: dom.string(),
  keyword: maybe(dom.string()),
  typeRef: maybe(typeRef),
  fnOrConstructor: maybe(fnOrConstructor),
  mappedType: maybe(mappedType),
  typeLiteral: maybe(typeLiteral),
}, { strip: true });
export type TsType = ReturnType<typeof tsType.parse>;

export const typeAliasDef = dom.record({
  tsType: tsType,
  typeParams: dom.array(dom.record({
    name: dom.string(),
  })),
});

export const constructor = dom.record({
  name: dom.string(),
  params: dom.array(param),
}, { strip: true });

export const method = dom.record({
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
