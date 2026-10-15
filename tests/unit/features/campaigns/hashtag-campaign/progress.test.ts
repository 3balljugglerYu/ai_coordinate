/**
 * つかう人の抽選の口数(3作品=1口 / 6作品=2口 / 10作品=3口。2026-10-14 ユーザー決定)と、
 * 企画ページの表示の決まりが DB(マイグレーション)とずれていないこと。
 */
import fs from "node:fs";
import path from "node:path";
import { nextTicketTier, ticketsForWorks } from "@/features/campaigns/hashtag-campaign/progress";
import { isHashtagCampaignKey } from "@/features/campaigns/hashtag-campaign/campaign-key";
import { HALLOWEEN_BEST_SHOT } from "@/features/campaigns/halloween/halloween-best-shot";
import { normalizeHashtag } from "@/lib/hashtag";

const TIERS = HALLOWEEN_BEST_SHOT.tickets;

describe("ticketsForWorks / nextTicketTier", () => {
  test.each([
    [0, 0],
    [2, 0],
    [3, 1],
    [5, 1],
    [6, 2],
    [9, 2],
    [10, 3],
    [25, 3],
  ])("%i作品なら%i口(最大3口)", (works, tickets) => {
    expect(ticketsForWorks(works, TIERS)).toBe(tickets);
  });

  test("次のしきい値。3口に届いたら null", () => {
    expect(nextTicketTier(0, TIERS)).toEqual({ works: 3, tickets: 1 });
    expect(nextTicketTier(4, TIERS)).toEqual({ works: 6, tickets: 2 });
    expect(nextTicketTier(9, TIERS)).toEqual({ works: 10, tickets: 3 });
    expect(nextTicketTier(10, TIERS)).toBeNull();
  });

  test("並び順に頼らない(しきい値が逆順でも同じ答え)", () => {
    const reversed = [...TIERS].reverse();
    expect(ticketsForWorks(7, reversed)).toBe(2);
    expect(nextTicketTier(7, reversed)).toEqual({ works: 10, tickets: 3 });
  });
});

describe("企画のキー", () => {
  test("DB の CHECK と同じ形だけ通す", () => {
    expect(isHashtagCampaignKey("halloween-best-shot")).toBe(true);
    expect(isHashtagCampaignKey("")).toBe(false);
    expect(isHashtagCampaignKey("Halloween")).toBe(false);
    expect(isHashtagCampaignKey("a/b")).toBe(false);
    expect(isHashtagCampaignKey("a".repeat(65))).toBe(false);
  });
});

describe("ハロウィン企画の決まりが DB とずれていない", () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/20261015100000_add_hashtag_campaign_entries.sql"),
    "utf8",
  );
  const seed = sql.match(
    /VALUES \(\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)'\s*\)\s*ON CONFLICT \(key\)/,
  );

  test("キーとハッシュタグ(正規化した形)が同じ", () => {
    expect(seed).not.toBeNull();
    const [, key, hashtagNormalized] = seed!;
    expect(key).toBe(HALLOWEEN_BEST_SHOT.campaignKey);
    expect(hashtagNormalized).toBe(normalizeHashtag(HALLOWEEN_BEST_SHOT.hashtag.replace(/^#/, "")));
  });

  test("期間がページの表示(10/16(金) 20:00 〜 10/31(土) 23:59)と同じ", () => {
    const [, , , startsAt, endsAt] = seed!;
    const jst = (iso: string, offsetMs = 0) =>
      new Date(new Date(iso.replace(" ", "T").replace("+09", "+09:00")).getTime() + offsetMs).toLocaleString(
        "ja-JP",
        { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" },
      );
    expect(jst(startsAt)).toBe("10/16 20:00");
    expect(HALLOWEEN_BEST_SHOT.startLabel).toBe("10/16(金) 20:00");
    // 終わりの時刻ちょうどは含まないので、表示は1分前
    expect(jst(endsAt, -60_000)).toBe("10/31 23:59");
    expect(HALLOWEEN_BEST_SHOT.endLabel).toBe("10/31(土) 23:59");
  });
});
