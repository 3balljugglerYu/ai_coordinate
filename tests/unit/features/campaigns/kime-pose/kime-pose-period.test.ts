/** @jest-environment node */

/**
 * 決めポーズ企画の期間と段階(画面の出し分け用)。
 *
 * 応募期間の正本は DB の hashtag_campaigns(応募作の記録・投稿画面のタグ候補が読む)。
 * 画面の出し分けは設定ファイルの値で決めるので、2つが食い違わないことをマイグレーションの SQL と比べて確かめる。
 * 投票期間は DB に持たない(票はいつもの利用回数で数え、新しく数える仕組みを作らないため)。
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { KIME_POSE, getKimePosePhase } from "@/features/campaigns/kime-pose/kime-pose";

const MIGRATION = path.join(
  process.cwd(),
  "supabase/migrations/20261030180000_add_kime_pose_hashtag_campaign.sql",
);

describe("決めポーズ企画の期間", () => {
  test("⭐DB に入れた応募期間・ハッシュタグ(マイグレーション)と同じ", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    const match = sql.match(/'kime-pose',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)'/);
    expect(match).not.toBeNull();
    const [, hashtagSql, startsAtSql, endsAtSql] = match as RegExpMatchArray;
    // DB のタグは normalizeHashtag() の値(先頭の # なし・NFKC・小文字)
    expect(hashtagSql).toBe(KIME_POSE.hashtag.slice(1).normalize("NFKC").toLowerCase());
    // SQL は「2026-11-01 00:00:00+09」の形。Date で読める形にそろえて比べる
    const toIso = (value: string) => value.replace(" ", "T").replace(/\+09$/, "+09:00");
    expect(Date.parse(KIME_POSE.submitStartsAt)).toBe(Date.parse(toIso(startsAtSql)));
    expect(Date.parse(KIME_POSE.submitEndsAt)).toBe(Date.parse(toIso(endsAtSql)));
  });

  test("画面に出している期間の文字とも合っている(応募 11/1〜11/15・投票 11/16〜11/22)", () => {
    expect(KIME_POSE.submitStartLabel).toBe("11/1(日) 0:00");
    expect(KIME_POSE.submitEndLabel).toBe("11/15(日) 23:59");
    expect(KIME_POSE.voteStartLabel).toBe("11/16(月) 0:00");
    expect(KIME_POSE.voteEndLabel).toBe("11/22(日) 23:59");
    expect(KIME_POSE.submitStartsAt).toBe("2026-11-01T00:00:00+09:00");
    // 応募の終わり = 投票の始まり(間に空きを作らない)
    expect(KIME_POSE.submitEndsAt).toBe("2026-11-16T00:00:00+09:00");
    expect(KIME_POSE.voteEndsAt).toBe("2026-11-23T00:00:00+09:00");
  });

  test.each([
    ["10/31 23:59:59", "2026-10-31T23:59:59+09:00", "before"],
    ["11/1 0:00:00(応募の始まり)", "2026-11-01T00:00:00+09:00", "submit"],
    ["11/15 23:59:59(応募の最後の1秒)", "2026-11-15T23:59:59+09:00", "submit"],
    ["11/16 0:00:00(投票の始まり)", "2026-11-16T00:00:00+09:00", "vote"],
    ["11/22 23:59:59(投票の最後の1秒)", "2026-11-22T23:59:59+09:00", "vote"],
    ["11/23 0:00:00(締め切りのあと)", "2026-11-23T00:00:00+09:00", "closed"],
  ])("%s は %s", (_label, iso, expected) => {
    expect(getKimePosePhase(Date.parse(iso))).toBe(expected);
  });

  test("賞は Amazonギフトカード 5,000円分を1名様、ペルコイン200枚を10名様(2026-10-30 ユーザー決定)", () => {
    expect(KIME_POSE.prizes.map((prize) => [prize.gift, prize.amount, prize.unit, prize.winners])).toEqual([
      ["Amazonギフトカード", "5,000", "円分", "1名様"],
      ["ペルコイン", "200", "枚", "10名様"],
    ]);
  });
});
