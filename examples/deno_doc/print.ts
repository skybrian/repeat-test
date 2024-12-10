import type {
  Constructor,
  DenoDoc,
  FnOrConstructor,
  InterfaceMethod,
  Literal,
  Method,
  Param,
  Property,
  TsType,
  TypeLiteral,
  TypeMethod,
  TypeRef,
} from "./schema.ts";

import { assert } from "@std/assert/assert";

function stringFromLiteral(lit: Literal) {
  switch (lit.kind) {
    case "boolean":
      return lit.boolean.toString();
    default:
      return "(literal)";
  }
}

function stringFromProperty({ name, tsType }: Property, indent: number) {
  const type = tsType === null
    ? ""
    : ` : ${stringFromType(tsType, indent + 1)}`;
  return `${name}${type}`;
}

function stringFromTypeMethod(
  { name, params, returnType }: TypeMethod,
  indent: number,
) {
  const ind = "  ".repeat(indent);
  const paramList = params.map(stringFromParam).join(", ");
  return `${ind}${name}(${paramList}) => ${stringFromType(returnType, indent)}`;
}

function stringFromTypeLiteral(lit: TypeLiteral, indent: number) {
  const ind = "  ".repeat(indent);
  const props = lit.properties.map((p) =>
    `${ind}  ${stringFromProperty(p, indent)}\n`
  );
  const methods = lit.methods.map((m) =>
    `${ind}  ${stringFromTypeMethod(m, indent)}\n`
  );
  return `{\n${props.join("")}${methods.join("")}${ind}}`;
}

function stringFromTypeRef({ typeName, typeParams }: TypeRef) {
  if (typeParams !== null) {
    const params = typeParams.map(stringFromType).join(", ");
    return `${typeName}<${params}>`;
  }
  return typeName;
}

function stringFromFnOrConstructor(
  { params, tsType }: FnOrConstructor,
  indent: number,
) {
  const names = params.map(stringFromParam).join(", ");
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
    case "literal":
      return stringFromLiteral(t.literal);
    case "typeRef":
      return stringFromTypeRef(t.typeRef);
    case "fnOrConstructor":
      return stringFromFnOrConstructor(t.fnOrConstructor, indent);
    case "mapped": {
      const valType = stringFromType(t.mappedType.tsType, indent);
      return `[${t.mappedType.typeParam.name} ...]: ${valType}`;
    }
    case "indexedAccess": {
      const obj = stringFromType(t.indexedAccess.objType, indent);
      const index = stringFromType(t.indexedAccess.indexType, indent);
      return `${obj}[${index}]`;
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
    case "array": {
      const inner = stringFromType(t.array, indent);
      return inner + "[]";
    }
    case "parenthesized": {
      const inner = stringFromType(t.parenthesized, indent);
      return `(${inner})`;
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

function stringFromParam(param: Param): string {
  switch (param.kind) {
    case "identifier":
      return param.name;
    case "rest":
      return "..." + stringFromParam(param.arg);
    default:
      return "(param)";
  }
}

function lineFromConstructor({ name, params }: Constructor) {
  return `  ${name}(${params.map(stringFromParam).join(", ")})`;
}

function lineFromProperty({ name, tsType }: Property) {
  const type = tsType === null ? "" : ` : ${stringFromType(tsType, 1)}`;
  return `  ${name}${type}`;
}

function lineFromMethod({ name, functionDef }: Method) {
  const params = functionDef.params.map(stringFromParam).join(", ");
  const retType = functionDef.returnType === null
    ? ""
    : " : " + stringFromType(functionDef.returnType, 1);
  return `  ${name}(${params})${retType}`;
}

function lineFromInterfaceMethod(
  { name, params, returnType }: InterfaceMethod,
) {
  const pars = params.map(stringFromParam).join(", ");
  const retType = stringFromType(returnType, 1);
  return `  ${name}(${pars}) : ${retType}`;
}

export function* linesFromDenoDoc({ nodes }: DenoDoc) {
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
        const params = def.params.map(stringFromParam).join(", ");
        const retType = def.returnType === null
          ? ""
          : " : " + stringFromType(def.returnType, 0);
        yield `function ${node.name}(${params})${retType}`;
        break;
      }
      case "variable": {
        const def = node.variableDef;
        assert(def !== undefined);
        const type = stringFromType(def.tsType, 0);
        yield `${node.name} : ${type}`;
        break;
      }
      case "namespace":
        yield `namespace ${node.name}`;
        break;
      default:
        throw new Error(`unknown node kind\n\n${Deno.inspect(node)}`);
    }
    i++;
  }
}
