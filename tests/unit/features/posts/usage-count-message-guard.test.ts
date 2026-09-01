/**
 * 「◯回以上利用されました」の文言へ**生の回数**を渡す経路を作らせないための
 * 静的ガード。
 *
 * `usageCountBucket` の戻り値は `number | null` で、翻訳関数 `t()` の
 * `count` も `number` を受ける。そのため「丸めた値だけを渡す」という約束は
 * 型では表現できず、将来の呼び出しが素の回数を渡してもコンパイルは通る。
 * 文言側が「以上」で固定である以上、そこだけが嘘になる（8 回を「10回以上」）。
 *
 * 型で防げない代わりに、**文言キーを参照するファイルは必ず
 * `usageCountBucket` を import している**ことを機械的に検査する。
 * 新しい表示箇所を丸めなしで足すと、ここが落ちる。
 *
 * 補足: `/use-prompts` のショーケースだけは文言キーではなく JSX の直書きで、
 * 丸めは呼び出し側(`get-usable-prompt-showcase`)が済ませている。データの
 * 流れを追う検査はここでは行わないので、`UsablePromptShowcaseItem.usageCount`
 * の doc コメント（「丸めた値」）を正とすること。
 */

import fs from "node:fs";
import path from "node:path";

/** 「◯回以上」で固定の文言キー。生の回数を渡してはいけない。 */
const USAGE_MESSAGE_KEYS = ["sourcePromptUsageCount", "styleUsageCount"];

/** 走査対象。`messages/`(定義元)と `tests/` は除く。 */
const SOURCE_ROOTS = ["app", "features", "components", "lib", "hooks"];

const REPO_ROOT = path.resolve(__dirname, "../../../..");

function collectSourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "node_modules" ? [] : collectSourceFiles(full);
    }
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe("利用回数の文言ガード", () => {
  const files = SOURCE_ROOTS.flatMap((root) =>
    collectSourceFiles(path.join(REPO_ROOT, root))
  );

  test("走査対象が空になっていない(検査が素通りしていない)", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  test("文言キーを参照するファイルは必ず usageCountBucket を通す", () => {
    const offenders = files.filter((file) => {
      const source = fs.readFileSync(file, "utf8");
      const usesKey = USAGE_MESSAGE_KEYS.some((key) => source.includes(key));
      return usesKey && !source.includes("usageCountBucket");
    });

    expect(
      offenders.map((file) => path.relative(REPO_ROOT, file))
    ).toEqual([]);
  });

  test("文言キーの参照箇所が消えていない(キー名の変更に気づける)", () => {
    const referencing = files.filter((file) =>
      USAGE_MESSAGE_KEYS.some((key) =>
        fs.readFileSync(file, "utf8").includes(key)
      )
    );

    expect(referencing.length).toBeGreaterThan(0);
  });
});
