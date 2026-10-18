/** @jest-environment node */

/**
 * ハロウィン企画の期間(画面の出し分け用)。
 *
 * 正本は DB の hashtag_campaigns(応募作の記録・口数の計算が読む)。画面の出し分け
 * (ホームの注記・対象作品のラベルとボタン)は設定ファイルの値で決めるので、
 * 2つが食い違わないことをマイグレーションの SQL と比べて確かめる。
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import {
  HALLOWEEN_BEST_SHOT,
  isHalloweenBestShotOpen,
} from "@/features/campaigns/halloween/halloween-best-shot";

const MIGRATION = path.join(
  process.cwd(),
  "supabase/migrations/20261015100000_add_hashtag_campaign_entries.sql",
);

describe("ハロウィン企画の期間", () => {
  test("⭐DB に入れた期間(マイグレーション)と同じ", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    const match = sql.match(
      /'halloween-best-shot',\s*'[^']+',\s*'([^']+)',\s*'([^']+)'/,
    );
    expect(match).not.toBeNull();
    const [, startsAtSql, endsAtSql] = match as RegExpMatchArray;
    // SQL は「2026-10-16 20:00:00+09」の形。Date で読める形にそろえて比べる
    const toIso = (value: string) => value.replace(" ", "T").replace(/\+09$/, "+09:00");
    expect(Date.parse(HALLOWEEN_BEST_SHOT.startsAt)).toBe(Date.parse(toIso(startsAtSql)));
    expect(Date.parse(HALLOWEEN_BEST_SHOT.endsAt)).toBe(Date.parse(toIso(endsAtSql)));
  });

  test("画面に出している期間の文字とも合っている(10/16 20:00 〜 10/31 23:59)", () => {
    expect(HALLOWEEN_BEST_SHOT.startLabel).toBe("10/16(金) 20:00");
    expect(HALLOWEEN_BEST_SHOT.endLabel).toBe("10/31(土) 23:59");
    expect(HALLOWEEN_BEST_SHOT.startsAt).toBe("2026-10-16T20:00:00+09:00");
    expect(HALLOWEEN_BEST_SHOT.endsAt).toBe("2026-11-01T00:00:00+09:00");
  });

  test.each([
    ["10/16 19:59:59", "2026-10-16T19:59:59+09:00", false],
    ["10/16 20:00:00(始まり)", "2026-10-16T20:00:00+09:00", true],
    ["10/24 12:00", "2026-10-24T12:00:00+09:00", true],
    ["10/31 23:59:59(最後の1秒)", "2026-10-31T23:59:59+09:00", true],
    ["11/1 0:00:00(終わり)", "2026-11-01T00:00:00+09:00", false],
  ])("%s は期間中か → %s", (_label, iso, expected) => {
    expect(isHalloweenBestShotOpen(Date.parse(iso))).toBe(expected);
  });
});
