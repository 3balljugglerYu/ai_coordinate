/** @jest-environment node */

/**
 * 管理画面のすべてのページが、データを読む前に、ページ自体で管理者かを確かめていること。
 *
 * 2026-10-26、/admin などがレイアウトの確認だけに頼っていたため、未ログインの応答に
 * 売上や利用者のニックネームが含まれていた(Next.js はレイアウトとページを同時に描く)。
 * いまは proxy.ts でも /admin を止めているが、proxy は cookie を署名の確認なしに読むので、
 * ページの確認も残す。新しいページで確認を入れ忘れると、このテストが落ちる。
 *
 * 決まり(コメントと文字列を取り除いてから見る):
 *  - default export の関数の中で、`await connection()` の次に来る最初の await が、
 *    ensureAdminPage() か getUser() であること(getUser のあとは getAdminUserIds で確かめる)
 *  - または、try の中で requireAdmin() を呼び、失敗したら redirect すること(前からある書き方)
 *  - または、async でなく、データを読まずに redirect するだけのページ
 */

import fs from "node:fs";
import path from "node:path";

const ADMIN_DIR = path.join(process.cwd(), "app", "(app)", "admin");

function listPages(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listPages(full);
    return entry.name === "page.tsx" ? [full] : [];
  });
}

/** コメントと文字列を取り除く(説明の中に「ensureAdminPage()」と書いただけで通らないように)。 */
export function stripCommentsAndStrings(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/`(?:\\.|[^`\\])*`/g, "``")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
}

/** default export の関数の本体(そこから後ろ)。 */
function defaultExportBody(code: string): string | null {
  const index = code.search(/export\s+default\s+(async\s+)?function/);
  return index === -1 ? null : code.slice(index);
}

export function isGuarded(source: string): boolean {
  const code = stripCommentsAndStrings(source);
  const body = defaultExportBody(code);
  if (!body) return false;

  const isAsync = /export\s+default\s+async\s+function/.test(body);
  if (!isAsync) {
    // データを読まずに転送するだけ
    return /redirect\(/.test(body) && !/createAdminClient|createClient|\.from\(|\.rpc\(/.test(code);
  }

  const awaits = Array.from(body.matchAll(/await\s+([A-Za-z_$][\w$.]*)\s*\(/g)).map((m) => m[1]);
  const first = awaits.find((name) => name !== "connection");
  if (first === "ensureAdminPage") return true;
  if (first === "getUser") return /getAdminUserIds\(|isFullAdmin\(/.test(body);
  if (first === "requireAdmin") {
    return /try\s*\{\s*await\s+requireAdmin\(\)/.test(body) && /redirect\(/.test(body);
  }
  return false;
}

const pages = listPages(ADMIN_DIR);

describe("管理画面のページ", () => {
  test("ページが見つかる", () => {
    expect(pages.length).toBeGreaterThan(10);
  });

  test.each(pages.map((p) => [path.relative(process.cwd(), p)]))(
    "%s はデータを読む前に管理者かを確かめている",
    (relative) => {
      const source = fs.readFileSync(path.join(process.cwd(), relative), "utf8");
      expect(isGuarded(source)).toBe(true);
    },
  );
});

describe("isGuarded(決まりそのもの)", () => {
  test("データを読んでから確かめるページは通さない", () => {
    expect(
      isGuarded(`export default async function P() {
        await connection();
        const data = await getAdminDashboardData();
        await ensureAdminPage();
      }`),
    ).toBe(false);
  });

  test("コメントに書いただけでは通さない", () => {
    expect(
      isGuarded(`// TODO: ensureAdminPage() を呼ぶ
      export default async function P() {
        await connection();
        const data = await load();
      }`),
    ).toBe(false);
  });

  test("try なしの requireAdmin() は通さない(API 用で、redirect しない)", () => {
    expect(
      isGuarded(`export default async function P() {
        await connection();
        await requireAdmin();
      }`),
    ).toBe(false);
  });

  test("async でないのにデータを読むページは通さない", () => {
    expect(
      isGuarded(`export default function P() {
        const p = createAdminClient().from("x").select();
        if (!p) redirect("/");
        return p;
      }`),
    ).toBe(false);
  });

  test("先頭で確かめるページは通す", () => {
    expect(
      isGuarded(`export default async function P() {
        await connection();
        await ensureAdminPage();
        const data = await load();
      }`),
    ).toBe(true);
  });
});
