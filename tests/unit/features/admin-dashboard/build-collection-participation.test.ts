/**
 * 「どこで止まったか」の集計。
 *
 * 手集計でいちばん行動につながった数字がここだった。ファッション雑誌企画では
 * 到達ページ数の分布が 1p:3名 / 2p:2名 / 3p:1名 / 4p:1名 / 6p:1名 / 7p:2名 / 8p:19名 で、
 *  - 離脱は最初の1〜2枚に集中している
 *  - 4ページ以上進んだ人の82.6%は完走する
 *  - あと1枚で止まった人が2名いる
 * が読み取れた。生成数だけでは絶対に見えない。
 */

import { buildCollectionParticipation } from "@/features/admin-dashboard/lib/build-collection-participation";
import type {
  CollectionCompletionRow,
  CollectionImageJobRow,
  CollectionPreset,
} from "@/features/admin-dashboard/lib/build-collection-kpi";

const START = new Date("2026-08-08T10:00:00.000Z");
const NOW = new Date("2026-08-16T13:00:00.000Z");
const BEFORE = "2026-08-01T00:00:00.000Z";
const INSIDE = "2026-08-10T00:00:00.000Z";

const PRESETS: CollectionPreset[] = [
  { id: "p1", label: "表紙" },
  { id: "p2", label: "2枚目" },
  { id: "p3", label: "3枚目" },
];

function job(
  userId: string | null,
  presetId: string | null,
  createdAt = INSIDE,
): CollectionImageJobRow {
  return {
    created_at: createdAt,
    user_id: userId,
    generation_metadata: presetId ? { oneTapStyle: { id: presetId } } : null,
  };
}

function completion(
  userId: string,
  completedAt = INSIDE,
  status = "completed",
): CollectionCompletionRow {
  return { user_id: userId, completed_at: completedAt, mount_status: status };
}

function build(
  imageJobRows: CollectionImageJobRow[],
  completionRows: CollectionCompletionRow[] = [],
) {
  return buildCollectionParticipation({
    presets: PRESETS,
    imageJobRows,
    completionRows,
    currentStart: START,
    now: NOW,
  });
}

describe("ページ別の到達UU", () => {
  /*
    生成数だけだと「人が多い」と「一人が粘った」が区別できない。
    同じ 3件でも、3人が1回ずつなのか1人が3回なのかで意味が真逆になる。
  */
  test("⭐同じ生成数でも到達UUは人数を表す", () => {
    const manyUsers = build([
      job("u1", "p1"),
      job("u2", "p1"),
      job("u3", "p1"),
    ]);
    const onePersistentUser = build([
      job("u1", "p1"),
      job("u1", "p1"),
      job("u1", "p1"),
    ]);

    expect(manyUsers.pageReach[0].reachedUu).toBe(3);
    expect(onePersistentUser.pageReach[0].reachedUu).toBe(1);
  });

  test("生成が無いページも 0 で並ぶ(表示順を保つ)", () => {
    const result = build([job("u1", "p1")]);

    expect(result.pageReach.map((r) => r.presetId)).toEqual(["p1", "p2", "p3"]);
    expect(result.pageReach.map((r) => r.reachedUu)).toEqual([1, 0, 0]);
  });

  test("生成数は持たない(outfitCounts が正本。二重管理にしない)", () => {
    const result = build([job("u1", "p1"), job("u1", "p1")]);

    expect(result.pageReach[0]).toEqual({
      presetId: "p1",
      label: "表紙",
      reachedUu: 1,
    });
  });
});

describe("到達ページ数の分布", () => {
  test("⭐人数がページ数ごとに並ぶ", () => {
    const result = build([
      // 1ページで止まった2人
      job("a", "p1"),
      job("b", "p1"),
      // 3ページ揃えた1人
      job("c", "p1"),
      job("c", "p2"),
      job("c", "p3"),
    ]);

    expect(result.pageCountDistribution).toEqual([
      { pages: 1, users: 2 },
      { pages: 2, users: 0 },
      { pages: 3, users: 1 },
    ]);
  });

  /*
    0人のページ数を飛ばすと、離脱の谷が見えなくなる。
    「4ページで止まった人が0人」は、それ自体が情報。
  */
  test("⭐0人のページ数も必ず並ぶ(谷が見えるように)", () => {
    const result = build([job("a", "p1")]);

    expect(result.pageCountDistribution).toHaveLength(3);
    expect(result.pageCountDistribution[1]).toEqual({ pages: 2, users: 0 });
  });

  test("同じページを何度作っても到達ページ数は増えない", () => {
    const result = build([job("a", "p1"), job("a", "p1"), job("a", "p1")]);

    expect(result.pageCountDistribution[0]).toEqual({ pages: 1, users: 1 });
  });
});

describe("平均と撮り直し率", () => {
  test("1人あたり平均生成回数", () => {
    const result = build([
      job("a", "p1"),
      job("a", "p2"),
      job("b", "p1"),
    ]);

    expect(result.generatorUu).toBe(2);
    expect(result.avgGenerationsPerUser).toBe(1.5);
  });

  test("⭐撮り直し率は「同じページの2回目以降」の割合", () => {
    // 4生成 / 到達ページのべ2 → 2件が作り直し → 50%
    const result = build([
      job("a", "p1"),
      job("a", "p1"),
      job("a", "p2"),
      job("a", "p2"),
    ]);

    expect(result.redoRatePct).toBe(50);
  });

  test("全員が1回ずつなら撮り直し率は0", () => {
    expect(build([job("a", "p1"), job("b", "p2")]).redoRatePct).toBe(0);
  });

  test("完走者だけの平均生成回数", () => {
    const result = build(
      [
        // 完走者: 3生成
        job("a", "p1"),
        job("a", "p2"),
        job("a", "p3"),
        // 未完走: 1生成
        job("b", "p1"),
      ],
      [completion("a")],
    );

    expect(result.completerUu).toBe(1);
    expect(result.completerAvgGenerations).toBe(3);
    expect(result.avgGenerationsPerUser).toBe(2);
  });

  test("完走者がいなければ null(0 と区別する)", () => {
    expect(build([job("a", "p1")]).completerAvgGenerations).toBeNull();
  });

  test("参加者がいなければすべて null / 0", () => {
    const result = build([]);

    expect(result.generatorUu).toBe(0);
    expect(result.avgGenerationsPerUser).toBeNull();
    expect(result.redoRatePct).toBeNull();
  });
});

describe("集計対象の絞り込み", () => {
  test("期間外の生成は数えない", () => {
    const result = build([job("a", "p1", BEFORE), job("b", "p1", INSIDE)]);

    expect(result.generatorUu).toBe(1);
  });

  test("期間外の完走は完走者に数えない", () => {
    const result = build([job("a", "p1")], [completion("a", BEFORE)]);

    expect(result.completerUu).toBe(0);
  });

  test("completed 以外の完走行は数えない", () => {
    const result = build([job("a", "p1")], [completion("a", INSIDE, "failed")]);

    expect(result.completerUu).toBe(0);
  });

  /*
    生成は必ずログインユーザーに紐づく。user_id が無い行を人数に数えると
    「誰でもない1人」が母数に入る。
  */
  test("⭐user_id の無い行は人数に数えない", () => {
    const result = build([job(null, "p1"), job("a", "p1")]);

    expect(result.generatorUu).toBe(1);
    expect(result.pageReach[0].reachedUu).toBe(1);
  });

  /*
    プリセットが特定できない行(旧データ・メタデータ欠落)を丸ごと捨てると、
    「生成数の合計が合わない」よりたちの悪い「参加者が少なく見える」が起きる。
  */
  test("⭐プリセット不明の行も参加者と生成回数には数える", () => {
    const result = build([job("a", null), job("a", "p1")]);

    expect(result.generatorUu).toBe(1);
    expect(result.avgGenerationsPerUser).toBe(2);
    // ページ別の到達には数えない
    expect(result.pageReach[0].reachedUu).toBe(1);
  });
});
