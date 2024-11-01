import type {
  Constructor,
  FnOrConstructor,
  Method,
  Property,
  Schema,
  TsType,
  TypeLiteral,
  TypeParam,
  TypeRef,
} from "./schema.ts";

import { assert } from "@std/assert/assert";

function stringFromProperty({ name, tsType }: Property) {
  return `${name} : ${stringFromType(tsType as TsType)}`;
}

function stringFromTypeLiteral(lit: TypeLiteral) {
  const propNames = lit.properties.map((p) => `  ${stringFromProperty(p)}\n`);
  return `{\n${propNames.join("")}}`;
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

function stringFromFnOrConstructor({ params, tsType }: FnOrConstructor) {
  const names = params.map((p) => p.name ?? "?").join(", ");
  const ret = tsType.kind === "keyword"
    ? tsType.keyword
    : `${stringFromType(tsType as TsType)}`;
  return `(${names}) => ${ret}`;
}

function stringFromType(
  { kind, keyword, typeRef, fnOrConstructor, mappedType, typeLiteral }: TsType,
): string {
  switch (kind) {
    case "keyword": {
      assert(keyword);
      return keyword;
    }
    case "typeRef": {
      assert(typeRef);
      return stringFromTypeRef(typeRef);
    }
    case "fnOrConstructor": {
      assert(fnOrConstructor);
      return stringFromFnOrConstructor(fnOrConstructor);
    }
    case "mapped": {
      assert(mappedType);
      const valType = stringFromType(mappedType.tsType as TsType);
      return `[${mappedType.typeParam.name} ...]: ${valType}`;
    }
    case "typeLiteral": {
      assert(typeLiteral);
      return stringFromTypeLiteral(typeLiteral);
    }
    default:
      return `(${kind})`;
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
  return `  ${name}: ${stringFromType(tsType as TsType)}`;
}

function lineFromMethod({ name, functionDef }: Method) {
  const params = functionDef.params.map((p) => p.name ?? "?").join(", ");
  const retType = stringFromType(functionDef.returnType);
  return `  ${name}(${params}) : ${retType}`;
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
        yield `type ${name} = ${stringFromType(def.tsType)}`;
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
        for (const sig of def.callSignatures) {
          yield `  ${stringFromFnOrConstructor(sig)}`;
        }
        yield* def.properties.map(lineFromProperty);
        yield* def.methods.map(lineFromMethod);
        yield "}";
        break;
      }
      default:
        yield `${node.name} -> ${node.kind}`;
    }
    i++;
  }
}
