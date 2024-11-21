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

function maybe<T>(d: Domain<T>) {
  return dom.firstOf(dom.of(undefined), d);
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
};

/**
 * Creates a schema for 'deno doc --json' with the given options.
 */
export function makeDenoDocSchema(opts?: DenoDocSchemaOpts) {
  const typeName = opts?.typeName ?? dom.string();
  const typeParamName = opts?.typeParamName ?? dom.string();
  const valName = opts?.valName ?? dom.string();
  const text = opts?.text ?? dom.string();

  const literal: Domain<Literal> = dom.taggedUnion("kind", [
    dom.object({ kind: dom.of("boolean"), boolean: dom.boolean() }),
  ]);

  /** A recursive (non-toplevel) reference to a tsType. */
  const innerType: Domain<TsType> = dom.alias(() => tsType);

  const typeParam = dom.taggedUnion<TypeParam>("kind", [
    object({ kind: dom.of("typeRef"), repr: typeParamName }),
    object({ kind: dom.of("indexedAccess"), repr: typeParamName }),
    object({
      kind: dom.of("keyword"),
      repr: valName, // TODO: actual keywords
    }),
  ]);

  const typeRef: Domain<TypeRef> = object({
    typeName,
    typeParams: dom.firstOf(dom.of(null), dom.array(typeParam)),
  });

  const innerParam: Domain<Param> = dom.alias(() => param);

  const param: Domain<Param> = dom.taggedUnion<Param>("kind", [
    object({ kind: dom.of("identifier"), name: valName }),
    object({ kind: dom.of("rest"), arg: innerParam }),
  ]);

  const fnOrConstructor: Domain<FnOrConstructor> = object({
    params: dom.array(param),
    tsType: innerType,
  });

  const property: RowDomain<Property> = object({
    name: valName,
    tsType: innerType,
  });

  const mappedType: Domain<MappedType> = object({
    typeParam: object({
      name: typeParamName,
    }),
    tsType: innerType,
  });

  const typeLiteral: Domain<TypeLiteral> = object({
    properties: dom.array(property),
  });

  const tsType: Domain<TsType> = dom.taggedUnion<TsType>("kind", [
    object({ kind: dom.of("literal"), literal }),
    object({
      kind: dom.of("keyword"),
      keyword: valName, // TODO: actual keywords
    }),
    object({ kind: dom.of("typeRef"), typeRef }),
    object({
      kind: dom.of("fnOrConstructor"),
      fnOrConstructor,
    }),
    object({ kind: dom.of("mapped"), mappedType }),
    object({ kind: dom.of("mappedType") }),
    object({ kind: dom.of("typeOperator") }),
    object({ kind: dom.of("typeLiteral"), typeLiteral }),
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

  const typeAliasDef = object({
    tsType,
    typeParams: dom.table(
      object({
        name: typeName,
      }),
      { keys: ["name"] },
    ),
  });

  const construct: Domain<Constructor> = object({
    name: valName,
    params: dom.array(param),
  });

  const functionDef: Domain<FunctionDef> = object({
    params: dom.array(param),
    returnType: tsType,
  });

  const method: RowDomain<Method> = object({
    name: valName,
    functionDef: functionDef,
  });

  const classDef = object({
    isAbstract: dom.boolean(),
    typeParams: dom.table(
      object({ name: typeParamName }),
      { keys: ["name"] },
    ),
    constructors: dom.array(construct),
    properties: dom.table(property, { keys: ["name"] }),
    methods: dom.array(method), // multiple method signatures are possible
  });

  const interfaceMethod: RowDomain<InterfaceMethod> = object({
    name: typeName,
    params: dom.array(param),
    returnType: tsType,
  });

  const interfaceDef = object({
    typeParams: dom.table(dom.object({ name: typeName }), {
      keys: ["name"],
    }),
    callSignatures: dom.array(fnOrConstructor),
    properties: dom.table(property, { keys: ["name"] }),
    methods: dom.table(interfaceMethod, { keys: ["name"] }),
  });

  const variableDef = object({ tsType });

  // TODO: distinguish type names and val names
  const name = valName;

  const node = dom.taggedUnion<Node>("kind", [
    object({
      kind: dom.of("typeAlias"),
      name,
      typeAliasDef,
    }),
    object({
      kind: dom.of("class"),
      name,
      classDef,
    }),
    object({
      kind: dom.of("interface"),
      name,
      interfaceDef,
    }),
    object({
      kind: dom.of("function"),
      name,
      functionDef,
    }),
    object({
      kind: dom.of("variable"),
      name,
      variableDef,
    }),
    object({
      kind: dom.of("moduleDoc"),
      name,
      moduleDoc: maybe(text),
    }),
  ]);

  const denoDoc: Domain<DenoDoc> = object({
    version: dom.of(1),
    nodes: dom.table(node, { keys: ["name"] }),
  });

  return denoDoc;
}

/**
 * A partial schema for the JSON printed by `deno doc --json`.
 */
export const denoDoc: Domain<DenoDoc> = makeDenoDocSchema();
