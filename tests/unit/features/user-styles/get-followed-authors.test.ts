/** @jest-environment node */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));

import {
  USER_STYLE_AUTHOR_CHIP_LIMIT,
  getUserStyleFollowedAuthors,
} from "@/features/user-styles/lib/get-followed-authors";
import { createAdminClient } from "@/lib/supabase/admin";

const mockCreateAdminClient = createAdminClient as jest.MockedFunction<
  typeof createAdminClient
>;

function createStub(options: {
  rows?: unknown[];
  error?: { code: string } | null;
}) {
  const rpc = jest.fn().mockResolvedValue({
    data: options.rows ?? [],
    error: options.error ?? null,
  });
  return { rpc } as unknown as ReturnType<typeof createAdminClient> & {
    rpc: jest.Mock;
  };
}

describe("getUserStyleFollowedAuthors", () => {
  beforeEach(() => jest.clearAllMocks());

  /*
    ⭐ 未ログインは「空のチップ列」であって「エラー」ではない。
    チップが出ないだけでページは成立するので、往復も発生させない。
  */
  test("未ログインは RPC を呼ばずに空", async () => {
    const stub = createStub({});
    mockCreateAdminClient.mockReturnValue(stub);

    await expect(getUserStyleFollowedAuthors(null)).resolves.toEqual([]);
    expect(stub.rpc).not.toHaveBeenCalled();
  });

  test("閲覧者と上限を RPC に渡す", async () => {
    const stub = createStub({});
    mockCreateAdminClient.mockReturnValue(stub);

    await getUserStyleFollowedAuthors("viewer-1");

    expect(stub.rpc).toHaveBeenCalledWith("get_user_style_followed_authors", {
      p_viewer_id: "viewer-1",
      p_limit: USER_STYLE_AUTHOR_CHIP_LIMIT,
    });
  });

  /*
    ⭐ 上限は RPC 側の p_limit 制約（1..50）以下でなければならない。
    超えると RPC が例外を投げ、チップが丸ごと出なくなる。
  */
  test("既定の上限は RPC の制約 50 を超えない", () => {
    expect(USER_STYLE_AUTHOR_CHIP_LIMIT).toBeLessThanOrEqual(50);
    expect(USER_STYLE_AUTHOR_CHIP_LIMIT).toBeGreaterThan(0);
  });

  test("RPC の並び順を保ったまま camelCase へ写す", async () => {
    const stub = createStub({
      rows: [
        {
          author_id: "a1",
          nickname: "ふたり",
          avatar_url: "https://example.test/a.webp",
          latest_posted_at: "2026-09-18T00:00:00Z",
        },
        {
          author_id: "a2",
          nickname: null,
          avatar_url: null,
          latest_posted_at: "2026-09-17T00:00:00Z",
        },
      ],
    });
    mockCreateAdminClient.mockReturnValue(stub);

    await expect(getUserStyleFollowedAuthors("viewer-1")).resolves.toEqual([
      {
        authorId: "a1",
        nickname: "ふたり",
        avatarUrl: "https://example.test/a.webp",
        latestPostedAt: "2026-09-18T00:00:00Z",
      },
      {
        authorId: "a2",
        nickname: null,
        avatarUrl: null,
        latestPostedAt: "2026-09-17T00:00:00Z",
      },
    ]);
  });

  /*
    ⭐ fail closed。チップの取得に失敗しても一覧は出せるので、
    ページごと落とさずチップだけ消す。
  */
  test("RPC エラーなら空（例外を投げない）", async () => {
    const stub = createStub({ error: { code: "42883" } });
    mockCreateAdminClient.mockReturnValue(stub);
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});

    await expect(getUserStyleFollowedAuthors("viewer-1")).resolves.toEqual([]);
    spy.mockRestore();
  });
});
