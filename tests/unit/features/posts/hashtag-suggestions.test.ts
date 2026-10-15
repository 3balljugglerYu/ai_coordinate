/** @jest-environment node */

jest.mock("server-only", () => ({}));
jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";
import { getHashtagSuggestions } from "@/features/posts/lib/hashtag-suggestions";

const mockCreateAdminClient = createAdminClient as jest.MockedFunction<typeof createAdminClient>;

const USER_ID = "user-1";
const IMAGE_ID = "image-1";

type TableResult = { data: unknown; error?: unknown };

/**
 * テーブル名ごとに返す結果を決めた、Supabase の問い合わせの代わり。
 * 絞り込み(eq など)はそのまま自分を返し、最後に待った(await / maybeSingle)ところで結果を返す。
 */
function fakeClient(tables: Record<string, TableResult>) {
  return {
    from(table: string) {
      const result = tables[table] ?? { data: null };
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "eq", "is", "order", "limit"]) {
        builder[method] = () => builder;
      }
      builder.maybeSingle = () => Promise.resolve(result);
      builder.then = (
        resolve: (value: TableResult) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => Promise.resolve(result).then(resolve, reject);
      return builder;
    },
  };
}

// ハロウィン企画: 10/16(金) 20:00 〜 11/1 0:00(JST)。終わりの時刻ちょうどは含まない
const HALLOWEEN = {
  hashtag_normalized: "うちの子のベストショット",
  starts_at: "2026-10-16T11:00:00+00:00",
  ends_at: "2026-10-31T15:00:00+00:00",
};

const DURING = new Date("2026-10-20T03:00:00Z");

function setTables(overrides: Record<string, TableResult> = {}) {
  mockCreateAdminClient.mockReturnValue(
    fakeClient({
      // CREATE の作品(ワンタップの記録がない = 企画カテゴリのタグはない)
      generated_images: { data: { user_id: USER_ID, image_job_id: "job-1" } },
      generation_prompt_snapshots: { data: null },
      post_hashtags: { data: [{ hashtags: { name: "冬服" } }] },
      hashtag_campaigns: { data: [HALLOWEEN] },
      ...overrides,
    }) as never,
  );
}

describe("getHashtagSuggestions: 開催中の企画のタグ(2026-10-16 ユーザー決定)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("期間中は、CREATE の作品でも企画のタグをいちばん前に出す", async () => {
    setTables();

    await expect(getHashtagSuggestions(USER_ID, IMAGE_ID, DURING)).resolves.toEqual([
      { name: "うちの子のベストショット", source: "campaign" },
      { name: "冬服", source: "recent" },
    ]);
  });

  test("期間中は、ワンタップの作品でも企画のタグを出す(並びは 企画 → カテゴリ → 前に使ったタグ)", async () => {
    setTables({
      generation_prompt_snapshots: { data: { source_revision: "preset-1" } },
      style_presets: { data: { category_id: "category-1" } },
      preset_categories: { data: { hashtag_suggestions: ["うちの子のオーストラリア旅行"] } },
    });

    await expect(getHashtagSuggestions(USER_ID, IMAGE_ID, DURING)).resolves.toEqual([
      { name: "うちの子のベストショット", source: "campaign" },
      { name: "うちの子のオーストラリア旅行", source: "category" },
      { name: "冬服", source: "recent" },
    ]);
  });

  test("始まる時刻ちょうど(10/16 20:00)から出す", async () => {
    setTables();

    const result = await getHashtagSuggestions(USER_ID, IMAGE_ID, new Date("2026-10-16T11:00:00Z"));

    expect(result[0]).toEqual({ name: "うちの子のベストショット", source: "campaign" });
  });

  test("始まる前(10/16 19:59:59)は出さない", async () => {
    setTables();

    await expect(
      getHashtagSuggestions(USER_ID, IMAGE_ID, new Date("2026-10-16T10:59:59Z")),
    ).resolves.toEqual([{ name: "冬服", source: "recent" }]);
  });

  test("終わりの時刻ちょうど(11/1 0:00)からは出さない。直前(10/31 23:59:59)までは出す", async () => {
    setTables();

    await expect(
      getHashtagSuggestions(USER_ID, IMAGE_ID, new Date("2026-10-31T15:00:00Z")),
    ).resolves.toEqual([{ name: "冬服", source: "recent" }]);

    const lastSecond = await getHashtagSuggestions(USER_ID, IMAGE_ID, new Date("2026-10-31T14:59:59Z"));
    expect(lastSecond[0]).toEqual({ name: "うちの子のベストショット", source: "campaign" });
  });

  test("前に自分で使ったタグと同じなら、企画のタグとして1つだけ出す", async () => {
    setTables({
      post_hashtags: {
        data: [{ hashtags: [{ name: "うちの子のベストショット" }] }, { hashtags: { name: "冬服" } }],
      },
    });

    await expect(getHashtagSuggestions(USER_ID, IMAGE_ID, DURING)).resolves.toEqual([
      { name: "うちの子のベストショット", source: "campaign" },
      { name: "冬服", source: "recent" },
    ]);
  });

  test("企画が読めなくても、ほかの候補は出す", async () => {
    setTables({ hashtag_campaigns: { data: null, error: { message: "boom" } } });

    await expect(getHashtagSuggestions(USER_ID, IMAGE_ID, DURING)).resolves.toEqual([
      { name: "冬服", source: "recent" },
    ]);
  });

  test("他人の作品には、企画のタグも含めて何も返さない", async () => {
    setTables({ generated_images: { data: { user_id: "someone-else", image_job_id: "job-1" } } });

    await expect(getHashtagSuggestions(USER_ID, IMAGE_ID, DURING)).resolves.toEqual([]);
  });
});
