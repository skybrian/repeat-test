import type {
  Constructor,
  FnOrConstructor,
  InterfaceMethod,
  Method,
  Property,
  Schema,
  TsType,
  TypeLiteral,
  TypeParam,
  TypeRef,
} from "./schema.ts";

import { assert } from "@std/assert/assert";

function stringFromProperty({ name, tsType }: Property, indent: number) {
  return `${name} : ${stringFromType(tsType, indent)}`;
}

function stringFromTypeLiteral(lit: TypeLiteral, indent: number) {
  const ind = "  ".repeat(indent);
  const propNames = lit.properties.map((p) =>
    `${ind}  ${stringFromProperty(p, indent + 1)}\n`
  );
  return `{\n${propNames.join("")}${ind}}`;
}

function stringFromTypeParam({ repr }: TypeParam): string {
  return repr === "" ? "..." : repr;
}

function stringFromTypeRef({ typeName, typeParams }: TypeRef) {
  if (typeParams !== null) {
    const params = typeParams.map(stringFromTypeParam).join(", ");
    return `${typeName}<${params}>`;
  }
  return typeName;
}

function stringFromFnOrConstructor(
  { params, tsType }: FnOrConstructor,
  indent: number,
) {
  const names = params.map((p) => p.name ?? "?").join(", ");
  const ret = stringFromType(tsType, indent + 1);
  return `(${names}) => ${ret}`;
}

function stringFromType(
  t: TsType,
  indent: number,
): string {
  switch (t.kind) {
    case "keyword":
      return t.keyword;
    case "typeRef":
      return stringFromTypeRef(t.typeRef);
    case "fnOrConstructor":
      return stringFromFnOrConstructor(t.fnOrConstructor, indent);
    case "mapped": {
      const valType = stringFromType(t.mappedType.tsType, indent);
      return `[${t.mappedType.typeParam.name} ...]: ${valType}`;
    }
    case "typeLiteral":
      return stringFromTypeLiteral(t.typeLiteral, indent);
    case "union": {
      const types = t.union.map((t) => stringFromType(t, indent));
      return types.join(" | ");
    }
    case "intersection": {
      const types = t.intersection.map((t) => stringFromType(t, indent));
      return types.join(" & ");
    }
    default:
      return `(${t.kind})`;
  }
}

function stringFromTypeParams(typeParams: { name: string }[]): string {
  return typeParams.length === 0
    ? ""
    : `<${typeParams.map((v) => v.name).join(", ")}>`;
}

function lineFromConstructor({ name, params }: Constructor) {
  return `  ${name}(${params.map((p) => p.name).join(", ")})`;
}

function lineFromProperty({ name, tsType }: Property) {
  return `  ${name}: ${stringFromType(tsType, 1)}`;
}

function lineFromMethod({ name, functionDef }: Method) {
  const params = functionDef.params.map((p) => p.name ?? "?").join(", ");
  const retType = stringFromType(functionDef.returnType, 1);
  return `  ${name}(${params}) : ${retType}`;
}

function lineFromInterfaceMethod(
  { name, params, returnType }: InterfaceMethod,
) {
  const pars = params.map((p) => p.name ?? "?").join(", ");
  const retType = stringFromType(returnType, 1);
  return `  ${name}(${pars}) : ${retType}`;
}

export function* linesFromSchema({ nodes }: Schema) {
  let i = 0;
  for (const node of nodes) {
    if (i > 0) {
      yield "";
    }
    switch (node.kind) {
      case "moduleDoc":
        continue;
      case "typeAlias": {
        const def = node.typeAliasDef;
        assert(def !== undefined);
        const typeParams = def.typeParams.map((val) => val.name);
        const name = typeParams.length > 0
          ? `${node.name}<${typeParams.join(", ")}>`
          : node.name;
        yield `type ${name} = ${stringFromType(def.tsType, 0)}`;
        break;
      }
      case "class": {
        const def = node.classDef;
        assert(def !== undefined);
        const typeParams = stringFromTypeParams(def.typeParams);
        yield `class ${node.name}${typeParams} {`;
        yield* def.constructors.map(lineFromConstructor);
        yield* def.properties.map(lineFromProperty);
        yield* def.methods.map(lineFromMethod);
        yield "}";
        break;
      }
      case "interface": {
        const def = node.interfaceDef;
        assert(def !== undefined);
        const typeParams = stringFromTypeParams(def.typeParams);
        yield `interface ${node.name}${typeParams} {`;
        yield* def.callSignatures.map((sig) =>
          "  " + stringFromFnOrConstructor(sig, 1)
        );
        yield* def.properties.map(lineFromProperty);
        yield* def.methods.map(lineFromInterfaceMethod);
        yield "}";
        break;
      }
      case "function": {
        const def = node.functionDef;
        assert(def !== undefined);
        const params = def.params.map((p) => p.name ?? "?").join(", ");
        const retType = stringFromType(def.returnType, 0);
        yield `${node.name} : (${params}) => ${retType}`;
        break;
      }
      case "variable": {
        const def = node.variableDef;
        assert(def !== undefined);
        const type = stringFromType(def.tsType, 0);
        yield `${node.name} : ${type}`;
        break;
      }
      default:
        yield `${node.name} -> ${node.kind}`;
    }
    i++;
  }
}
