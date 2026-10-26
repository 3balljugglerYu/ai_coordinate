/** @jest-environment node */

/**
 * 管理画面のすべてのページが、ページ自体で管理者かを確かめていること。
 *
 * 2026-10-26、/admin などがレイアウトの確認だけに頼っていたため、未ログインの応答に
 * 売上や利用者のニックネームが含まれていた(Next.js はレイアウトとページを同時に描く)。
 * 新しいページで確認を入れ忘れると、このテストが落ちる。
 *
 * 通るのは次のどれか:
 *  - ensureAdminPage() を呼んでいる
 *  - getUser と getAdminUserIds で確かめている(前からある書き方)
 *  - requireAdmin() で確かめている(前からある書き方)
 *  - データを読まず、redirect するだけ
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

function isGuarded(source: string): boolean {
  if (/ensureAdminPage\(\)/.test(source)) return true;
  if (/getUser\(/.test(source) && /getAdminUserIds\(/.test(source)) return true;
  if (/requireAdmin\(\)/.test(source)) return true;
  // データを読まない転送だけのページ
  const onlyRedirect = /redirect\(/.test(source) && !/await\s/.test(source);
  return onlyRedirect;
}

const pages = listPages(ADMIN_DIR);

test("管理画面のページが見つかる", () => {
  expect(pages.length).toBeGreaterThan(10);
});

test.each(pages.map((p) => [path.relative(process.cwd(), p)]))(
  "%s はページ自体で管理者かを確かめている",
  (relative) => {
    const source = fs.readFileSync(path.join(process.cwd(), relative), "utf8");
    expect(isGuarded(source)).toBe(true);
  },
);
