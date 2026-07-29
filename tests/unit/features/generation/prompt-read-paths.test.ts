/** @jest-environment node */

/**
 * プロンプト読み取り経路の網羅チェック。
 *
 * このテストは実装ではなく「見落とし」を検出するために書いている。
 *
 * 秘匿境界の移行では、同じ性質のミスを 3 度繰り返した。
 *   1. 列を削除したが、その列を参照する RPC を直し忘れた
 *   2. 新しい完了 RPC を作ったが、Worker の呼び出しを切り替え忘れた
 *   3. 読み取り経路を移行したが、生成一覧の経路を見落とした
 *
 * いずれも「対の片方を忘れる」型で、目視レビューでは繰り返し漏れた。
 * Phase 0C で generated_images.prompt を空にすると、移行し忘れた経路は
 * 「プロンプトが表示されない」形で初めて露見する。空化は実質不可逆なので、
 * 事前に機械的に潰す。
 *
 * 判定方法: generated_images から prompt を返しうるクエリを列挙し、
 * それぞれが author secret の解決を通っているかを検査する。
 * 新しい読み取り経路を足したときは、このテストが落ちて気づける。
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["app", "features", "lib"];
const RESOLVERS = ["resolveVisiblePrompts", "resolveOwnVisiblePrompts"];

/**
 * 解決を通さなくてよい経路。
 *
 * 除外は「なぜ安全か」を必ず書く。理由を書けないものは除外しない。
 */
const ALLOWED_WITHOUT_RESOLUTION: Array<{ file: string; reason: string }> = [
  {
    file: "app/api/admin/generate-webp/route.ts",
    reason:
      "WebP 変換のバッチ。storage path しか使わず prompt を参照も返却もしない",
  },
  {
    file: "app/api/reports/posts/route.ts",
    reason: "通報の受付。通報対象の存在確認のみで prompt を参照も返却もしない",
  },
  {
    file: "features/posts/lib/server-api.ts",
    reason:
      "enrichPosts / getPost が resolveVisiblePrompts を通す。getPostedImages は未使用",
  },
  {
    file: "features/my-page/lib/server-api.ts",
    reason:
      "一覧2経路は resolveVisiblePrompts を通す。getUserStatsServer は head:true で行を返さない",
  },
  {
    file: "features/my-page/lib/api.ts",
    reason: "resolveOwnVisiblePrompts を通す",
  },
  {
    file: "features/generation/lib/database.ts",
    reason:
      "取得2経路は resolveOwnVisiblePrompts を通す。saveGeneratedImages は書き込み、listCoordinateImagesCreatedAfter は未使用",
  },
];

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** generated_images から prompt を返しうるクエリを持つファイルを抽出する。 */
function findPromptReadingFiles(): string[] {
  const found = new Set<string>();

  for (const root of ROOTS) {
    for (const file of listSourceFiles(root)) {
      const src = readFileSync(file, "utf-8");
      if (!src.includes('from("generated_images")')) continue;

      const lines = src.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (!lines[i].includes('from("generated_images")')) continue;

        // クエリの直後 30 行から select を探す
        const window = lines.slice(i, i + 30).join("\n");
        const match = window.match(/\.select\(\s*("[^"]*"|'[^']*'|`[^`]*`)/);
        if (!match) continue;

        const selection = match[1];
        // head:true は件数のみで行を返さない
        if (/head:\s*true/.test(window)) continue;

        const returnsPrompt =
          selection.includes("*") || /\bprompt\b/.test(selection);
        if (returnsPrompt) {
          found.add(file);
          break;
        }
      }
    }
  }

  return Array.from(found).sort();
}

describe("プロンプト読み取り経路", () => {
  it("prompt を返すクエリを持つファイルは author secret の解決を通す", () => {
    const allowed = new Set(ALLOWED_WITHOUT_RESOLUTION.map((e) => e.file));
    const unresolved: string[] = [];

    for (const file of findPromptReadingFiles()) {
      const src = readFileSync(file, "utf-8");
      const resolves = RESOLVERS.some((r) => src.includes(r));
      if (!resolves && !allowed.has(file)) {
        unresolved.push(file);
      }
    }

    expect(unresolved).toEqual([]);
  });

  it("除外リストは実在するファイルだけを指す", () => {
    // ファイル移動やリネームで除外が空振りし、検査が骨抜きになるのを防ぐ
    const stale = ALLOWED_WITHOUT_RESOLUTION.filter((entry) => {
      try {
        statSync(entry.file);
        return false;
      } catch {
        return true;
      }
    }).map((entry) => entry.file);

    expect(stale).toEqual([]);
  });

  it("除外には理由が書かれている", () => {
    const missing = ALLOWED_WITHOUT_RESOLUTION.filter(
      (entry) => entry.reason.trim().length === 0
    ).map((entry) => entry.file);

    expect(missing).toEqual([]);
  });
});
