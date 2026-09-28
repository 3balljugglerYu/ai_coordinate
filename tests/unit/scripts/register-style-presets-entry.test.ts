/** @jest-environment node */

import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "../../..");

/*
  ⭐ 子プロセスには偽の接続先と鍵を先に渡しておく。入口は .env.local を読むが、
  設定済みの値は上書きしないので、手元に本番の .env.local があってもその値は使われず、
  CI(.env.local が無い)と同じ値で動く。万一 DB に触れても本番には届かない。
*/
const CHILD_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  PATH: process.env.PATH ?? "",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
};

const CHILD_OPTIONS = {
  cwd: REPO_ROOT,
  encoding: "utf8",
  timeout: 60_000,
  env: CHILD_ENV,
} as const;

function runNode(args: string[]): string {
  return execFileSync(process.execPath, args, CHILD_OPTIONS);
}

/*
  ⭐ Jest は自前の変換で TypeScript と `@/` を解決するので、単体テストが緑でも
  「node で実際に起動したら import が解決できない」ことは検出できない。
  フックを通して、登録に使う features/ の部品を本物の node で読み込む。
*/
test("フックを通すと、登録に使う features/ の部品(@/ と拡張子なしの import)を node で読み込める", () => {
  const script = `
    const [repository, storage, categories, cli] = await Promise.all([
      import("@/features/style-presets/lib/style-preset-repository"),
      import("@/features/style-presets/lib/style-preset-storage"),
      import("@/features/style-presets/lib/preset-category-repository"),
      import("./scripts/style-presets/register-style-presets.ts"),
    ]);
    console.log(JSON.stringify({
      createStylePreset: typeof repository.createStylePreset,
      listStylePresetsForAdmin: typeof repository.listStylePresetsForAdmin,
      uploadStylePresetImage: typeof storage.uploadStylePresetImage,
      deleteStylePresetImage: typeof storage.deleteStylePresetImage,
      getPresetCategoryByKey: typeof categories.getPresetCategoryByKey,
      runRegisterStylePresets: typeof cli.runRegisterStylePresets,
    }));
  `;

  const stdout = runNode([
    "--import",
    "./scripts/lib/register-typescript.mjs",
    "--input-type=module",
    "--eval",
    script,
  ]);

  const lastLine = stdout.trim().split("\n").pop() ?? "";
  expect(JSON.parse(lastLine)).toEqual({
    createStylePreset: "function",
    listStylePresetsForAdmin: "function",
    uploadStylePresetImage: "function",
    deleteStylePresetImage: "function",
    getPresetCategoryByKey: "function",
    runRegisterStylePresets: "function",
  });
}, 60_000);

test("入口のスクリプトは --help で使い方を標準出力に出して正常終了する", () => {
  const stdout = runNode([
    path.join("scripts", "register-style-presets.mjs"),
    "--help",
  ]);

  expect(stdout).toContain("使い方");
}, 60_000);

/*
  ⭐ 入口が本体の戻り値を終了コードに渡し、引数(process.argv の先頭2つを除いた分)を
  そのまま渡していることを確かめる。存在しないマニフェストなら Supabase に触れる前に止まる。
  .env.local からどのキーを入れるか・本体の import より先に入れるかは、
  allowed-env のテストと入口のコメントに任せる(ここでは確かめない)。
*/
test("入口のスクリプトは、マニフェストが無ければ標準エラーにファイル名を出して終了コード 1 で終わる", () => {
  const result = spawnSync(
    process.execPath,
    [
      path.join("scripts", "register-style-presets.mjs"),
      path.join("tmp", "no-such-manifest.json"),
    ],
    CHILD_OPTIONS
  );

  expect(result.status).toBe(1);
  expect(result.stderr).toContain("no-such-manifest.json");
}, 60_000);
