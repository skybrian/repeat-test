const projectRoot = new URL("../", import.meta.url);
const apiRoot = new URL("test/api/", projectRoot);

const allowedImports = new Set([
  "@skybrian/repeat-test",
  "@skybrian/repeat-test/core",
  "@skybrian/repeat-test/arbs",
  "@skybrian/repeat-test/doms",
  "@skybrian/repeat-test/runner",
  "node:test",
  "node:assert",
  "node:assert/strict",
]);

function isAllowed(specifier: string, filename: URL): boolean {
  if (allowedImports.has(specifier)) return true;
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) return false;

  try {
    // Decode before normalizing so encoded separators can't hide a path escape.
    const target = new URL(decodeURIComponent(specifier), filename);
    return target.href.startsWith(apiRoot.href) && !target.search &&
      !target.hash;
  } catch {
    return false;
  }
}

/**
 * Keeps public API tests and their helpers independent of private source files
 * and the internal test suite. This is an architectural rule, not a sandbox.
 */
export default {
  name: "repeat-test",
  rules: {
    "api-import-boundary": {
      create(context) {
        const filename = new URL(context.filename, projectRoot);
        if (!filename.href.startsWith(apiRoot.href)) return {};

        function check(source: Deno.lint.Node): void {
          if (source.type === "Literal" && typeof source.value === "string") {
            if (isAllowed(source.value, filename)) return;
            context.report({
              node: source,
              message:
                `Import "${source.value}" crosses the API test boundary.`,
              hint:
                "Use a published @skybrian/repeat-test entry point, a relative " +
                "import within test/api/, or an approved node: module.",
            });
          } else {
            context.report({
              node: source,
              message: "API tests must use string-literal module specifiers.",
              hint:
                "Computed dynamic imports cannot be checked for API isolation.",
            });
          }
        }

        function rejectRequire(node: Deno.lint.Node): void {
          context.report({
            node,
            message: "require() is not allowed in API tests.",
            hint: "Use an ES module import so the API boundary can be checked.",
          });
        }

        return {
          ImportDeclaration(node) {
            check(node.source);
          },
          ExportNamedDeclaration(node) {
            if (node.source) check(node.source);
          },
          ExportAllDeclaration(node) {
            check(node.source);
          },
          ImportExpression(node) {
            check(node.source);
          },
          TSImportType(node) {
            const argument = node.argument;
            check(
              argument.type === "TSLiteralType" ? argument.literal : argument,
            );
          },
          TSExternalModuleReference(node) {
            rejectRequire(node);
          },
          CallExpression(node) {
            const callee = node.callee;
            if (callee.type === "Identifier" && callee.name === "require") {
              rejectRequire(node);
            } else if (callee.type === "MemberExpression") {
              const object = callee.object;
              const property = callee.property;
              const isRequireProperty = callee.computed
                ? property.type === "Literal" && property.value === "require"
                : property.type === "Identifier" && property.name === "require";
              if (
                (object.type === "Identifier" && object.name === "require") ||
                (object.type === "Identifier" && object.name === "module" &&
                  isRequireProperty)
              ) {
                rejectRequire(node);
              }
            }
          },
        };
      },
    },
  },
} satisfies Deno.lint.Plugin;
