/**
 * scripts/ から features/ などの TypeScript のアプリコードを node で読み込むための
 * モジュールフック。登録は register-typescript.mjs が行う。
 *
 * - resolve: tsconfig.json の paths(`@/…`)と拡張子なしの import を、
 *   TypeScript 自身のモジュール解決で .ts / .tsx へ解決する
 * - load: .ts / .tsx を typescript.transpileModule で JS にする。型だけの import も
 *   ここで消える(Node の型除去は、`import type` の付かない型の import を残して落ちる)
 *
 * 依存を増やさないため、devDependencies の typescript だけを使う。
 * register / registerHooks のどちらでも動くよう、フックは同期で書く。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);

const { config } = ts.readConfigFile(
  path.join(repoRoot, "tsconfig.json"),
  ts.sys.readFile
);
// 欲しいのは compilerOptions(paths の基準の場所を含む)だけ。readDirectory を空にして、
// include に合うファイルをリポジトリ全体から探し回らせない
const { options: compilerOptions } = ts.parseJsonConfigFileContent(
  config,
  { ...ts.sys, readDirectory: () => [] },
  repoRoot
);

const TYPESCRIPT_FILE = /\.(?:ts|tsx|mts)$/;

function isTypeScriptSource(fileName) {
  return TYPESCRIPT_FILE.test(fileName) && !fileName.endsWith(".d.ts");
}

export function resolve(specifier, context, nextResolve) {
  const parentURL = context.parentURL;
  const isAppSpecifier = specifier.startsWith("@/") || specifier.startsWith(".");
  if (parentURL?.startsWith("file:") && isAppSpecifier) {
    const parentPath = fileURLToPath(parentURL);
    if (!parentPath.split(path.sep).includes("node_modules")) {
      const { resolvedModule } = ts.resolveModuleName(
        specifier,
        parentPath,
        compilerOptions,
        ts.sys
      );
      if (
        resolvedModule &&
        !resolvedModule.isExternalLibraryImport &&
        isTypeScriptSource(resolvedModule.resolvedFileName)
      ) {
        return {
          url: pathToFileURL(resolvedModule.resolvedFileName).href,
          shortCircuit: true,
        };
      }
    }
  }
  return nextResolve(specifier, context);
}

export function load(url, context, nextLoad) {
  if (url.startsWith("file:") && isTypeScriptSource(url)) {
    const fileName = fileURLToPath(url);
    const { outputText } = ts.transpileModule(readFileSync(fileName, "utf8"), {
      fileName,
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
        isolatedModules: true,
      },
    });
    return { format: "module", source: outputText, shortCircuit: true };
  }
  return nextLoad(url, context);
}
