/** @jest-environment node */

/**
 * 対象作品のラベルと「このカタログで生成する」の見た目(2026-10-16 ユーザー決定)。
 *
 * - 色は紫 → オレンジ(3案の見本からユーザーが選んだ案C)
 * - 「やや早めに流れる」動き(1周2秒・左から右)
 * - 「動きを減らす」設定では流さない(企画ページと同じ扱い)
 *
 * jsdom では CSS の動きを再生できないので、CSS の決まりそのものを読んで確かめる
 * (実際に流れること・止まることは開発サーバーで実測済み)。
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import {
  HALLOWEEN_TARGET_BADGE_CLASS,
  HALLOWEEN_TARGET_BUTTON_CLASS,
} from "@/features/campaigns/halloween/halloween-target-style";

const css = readFileSync(
  path.join(process.cwd(), "features/campaigns/halloween/halloween-target.module.css"),
  "utf8",
);

function ruleBody(source: string, selectorPattern: RegExp): string {
  const match = source.match(selectorPattern);
  if (!match || match.index === undefined) {
    throw new Error(`rule not found: ${selectorPattern}`);
  }
  const start = source.indexOf("{", match.index) + 1;
  return source.slice(start, source.indexOf("}", start));
}

describe("対象作品のラベルとボタンの見た目", () => {
  test("ラベルとボタンは同じ流れるグラデーション(文字は白)", () => {
    // CSS Modules はテストでは名前がそのまま返る(next/jest)
    expect(HALLOWEEN_TARGET_BADGE_CLASS).toBe("flow text-white");
    expect(HALLOWEEN_TARGET_BUTTON_CLASS).toBe("flow text-white");
  });

  test("紫 → オレンジ → 紫 の帯を2倍の幅で敷き、1周2秒で流す", () => {
    const flow = ruleBody(css, /^\.flow\s*\{/m);
    expect(flow).toContain("linear-gradient(90deg, #7b3fe4 0%, #ff7a1a 50%, #7b3fe4 100%)");
    expect(flow).toContain("background-size: 200% 100%");
    expect(flow).toContain("animation: halloween-target-flow 2s linear infinite");
  });

  test("左から右へ、帯1周ぶん(200%)動かす(つなぎ目で跳ばない)", () => {
    const keyframes = css.slice(css.indexOf("@keyframes halloween-target-flow"));
    expect(keyframes).toMatch(/from\s*\{\s*background-position: 200% 50%;/);
    expect(keyframes).toMatch(/to\s*\{\s*background-position: 0% 50%;/);
  });

  test("⭐「動きを減らす」設定では流さず、紫 → オレンジのまま止める", () => {
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).not.toBe(css);
    const flow = ruleBody(reduced, /\.flow\s*\{/);
    expect(flow).toContain("animation: none");
    expect(flow).toContain("linear-gradient(90deg, #7b3fe4 0%, #ff7a1a 100%)");
    expect(flow).toContain("background-size: 100% 100%");
  });
});
