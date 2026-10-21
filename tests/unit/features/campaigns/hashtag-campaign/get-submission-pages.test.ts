/**
 * 企画ページの「キャンペーン対象の投稿」の取得(2026-10-15 ユーザー決定)。
 *
 * - 応募作の一覧(list_hashtag_campaign_submissions)を、新しい順のまま6件ずつのページにする
 * - 1ページに同じ人は1件まで
 * - 使えるかは validate_derived_prompt_sources(requester = 作者本人)で確かめる(書き写さない)
 * - 読めなければ空配列(呼び出し側は区画ごと出さない)
 */

const rpcMock = jest.fn();

jest.mock("next/cache", () => ({ cacheLife: jest.fn(), cacheTag: jest.fn() }));
jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: rpcMock }),
}));
jest.mock("@/features/credits/lib/get-usable-prompt-showcase", () => ({
  fetchAuthorNames: jest.fn(async (_client: unknown, ids: string[]) => new Map(ids.map((id) => [id, `name-${id}`]))),
}));

import { cacheTag } from "next/cache";
import {
  getCampaignSubmissionPages,
  hashtagCampaignSubmissionsTag,
} from "@/features/campaigns/hashtag-campaign/get-submission-pages";

type Row = {
  post_id: string;
  author_id: string;
  storage_path_thumb: string | null;
  storage_path: string | null;
  image_url: string | null;
};

function row(postId: string, authorId: string, thumb: string | null = `thumb/${postId}.webp`): Row {
  return { post_id: postId, author_id: authorId, storage_path_thumb: thumb, storage_path: null, image_url: null };
}

function mockRpc({
  rows,
  listError = null,
  unavailable = [],
  validateError = null,
}: {
  rows: Row[];
  listError?: { code: string } | null;
  unavailable?: string[];
  validateError?: { code: string } | null;
}) {
  rpcMock.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === "list_hashtag_campaign_submissions") {
      return { data: listError ? null : rows, error: listError };
    }
    if (name === "validate_derived_prompt_sources") {
      const ids = args.p_source_post_ids as string[];
      return {
        data: validateError
          ? null
          : ids.map((id) => ({ source_post_id: id, is_available: !unavailable.includes(id) })),
        error: validateError,
      };
    }
    throw new Error(`unexpected rpc: ${name}`);
  });
}

// サムネイルの URL は storage のパスから作る(作れないと「壊れた画像」として落とされる)
const ORIGINAL_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
});
afterAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_SUPABASE_URL;
});

beforeEach(() => {
  rpcMock.mockReset();
});

describe("getCampaignSubmissionPages", () => {
  test("新しい順のまま6件ずつにし、1ページに同じ人は1件まで", async () => {
    mockRpc({
      rows: [
        row("p1", "A"),
        row("p2", "A"),
        row("p3", "B"),
        row("p4", "C"),
        row("p5", "D"),
        row("p6", "E"),
        row("p7", "F"),
        row("p8", "G"),
      ],
    });
    const pages = await getCampaignSubmissionPages("halloween-best-shot");
    expect(pages.map((page) => page.map((item) => item.postId))).toEqual([
      ["p1", "p3", "p4", "p5", "p6", "p7"],
      ["p2", "p8"],
    ]);
  });

  test("1件の中身は投稿 ID・サムネイル・作者名(画像の説明と確認に使う)。利用回数は読まない", async () => {
    mockRpc({ rows: [row("p1", "A")] });
    const [[first]] = await getCampaignSubmissionPages("halloween-best-shot");
    expect(first).toEqual({
      postId: "p1",
      thumbnailUrl: expect.stringContaining("thumb/p1.webp"),
      authorName: "name-A",
    });
    // 作者の ID は画面へ渡さない(ページ分けにだけ使う)
    expect(Object.keys(first)).not.toContain("authorId");
    expect(rpcMock).not.toHaveBeenCalledWith("get_prompt_usage_counts", expect.anything());
  });

  test("使えるかは作品ごとに作者本人を requester にして確かめ、使えないものは出さない", async () => {
    mockRpc({ rows: [row("p1", "A"), row("p2", "B")], unavailable: ["p1"] });
    const pages = await getCampaignSubmissionPages("halloween-best-shot");
    expect(rpcMock).toHaveBeenCalledWith("validate_derived_prompt_sources", {
      p_source_post_ids: ["p1", "p2"],
      p_requester_ids: ["A", "B"],
    });
    expect(pages.flat().map((item) => item.postId)).toEqual(["p2"]);
  });

  test("一覧は企画のキーで、上限つきで取る", async () => {
    mockRpc({ rows: [] });
    await getCampaignSubmissionPages("halloween-best-shot");
    expect(rpcMock).toHaveBeenCalledWith("list_hashtag_campaign_submissions", {
      p_campaign_key: "halloween-best-shot",
      p_limit: 120,
    });
    expect(cacheTag).toHaveBeenCalledWith(
      hashtagCampaignSubmissionsTag("halloween-best-shot"),
      // 投稿・編集・取り消しのあとすぐ取り直すための、企画をまたいだ印
      "hashtag-campaign-submissions",
    );
  });

  test("応募作がまだなければ空(使えるかの確認もしない)", async () => {
    mockRpc({ rows: [] });
    expect(await getCampaignSubmissionPages("halloween-best-shot")).toEqual([]);
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  test("一覧も確認も、読めなければ空", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    mockRpc({ rows: [row("p1", "A")], listError: { code: "PGRST202" } });
    expect(await getCampaignSubmissionPages("halloween-best-shot")).toEqual([]);
    mockRpc({ rows: [row("p1", "A")], validateError: { code: "57014" } });
    expect(await getCampaignSubmissionPages("halloween-best-shot")).toEqual([]);
    consoleError.mockRestore();
  });

  test("サムネイルが解決できない投稿は出さない", async () => {
    mockRpc({ rows: [row("p1", "A", null), row("p2", "B")] });
    const pages = await getCampaignSubmissionPages("halloween-best-shot");
    expect(pages.flat().map((item) => item.postId)).toEqual(["p2"]);
  });
});
