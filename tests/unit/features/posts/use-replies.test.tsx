/** @jest-environment jsdom */

import { act, renderHook, waitFor } from "@testing-library/react";
import { useReplies } from "@/features/posts/hooks/useReplies";
import type { ReplyComment } from "@/features/posts/types";

const getRepliesAPIMock = jest.fn();

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("@/features/posts/lib/api", () => ({
  getRepliesAPI: (...args: unknown[]) => getRepliesAPIMock(...args),
}));

jest.mock("@/lib/supabase/client", () => ({
  createClient: () => {
    const channel = {
      on: jest.fn(() => channel),
      subscribe: jest.fn(() => channel),
    };
    return {
      channel: () => channel,
      removeChannel: jest.fn(),
    };
  },
}));

function reply(id: string): ReplyComment {
  return {
    id,
    user_id: "user-1",
    image_id: "post-1",
    parent_comment_id: "comment-1",
    reply_to_comment_id: null,
    reply_to_deleted: false,
    reply_to: null,
    content: `reply ${id}`,
    created_at: "2026-04-16T00:00:00.000Z",
    updated_at: "2026-04-16T00:00:00.000Z",
    deleted_at: null,
    user_nickname: "taro",
    user_avatar_url: null,
  };
}

describe("useReplies 返信数変化時の表示安定性", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("parentReplyCount が増えても読み込み済みリストを消さない(空フラッシュしない)", async () => {
    // 初回は2件、増加検知後の再取得で3件を返す
    let resolveSecond: (value: ReplyComment[]) => void = () => undefined;
    getRepliesAPIMock
      .mockResolvedValueOnce([reply("r1"), reply("r2")])
      .mockImplementationOnce(
        () => new Promise<ReplyComment[]>((resolve) => (resolveSecond = resolve))
      );

    const { result, rerender } = renderHook(
      ({ count }) =>
        useReplies({
          parentCommentId: "comment-1",
          parentReplyCount: count,
          currentUserId: "user-1",
          enabled: true,
        }),
      { initialProps: { count: 2 } }
    );

    await waitFor(() => expect(result.current.replies).toHaveLength(2));
    expect(result.current.hasResolvedInitialLoad).toBe(true);

    // 親スレッド更新で返信数が 2 → 3 に(投稿後の onThreadChanged 相当)
    rerender({ count: 3 });

    // 再取得完了までの間、リストが空にならず「まだ返信はありません」条件
    // (空 + 読み込み済み)が成立しないこと
    expect(result.current.replies).toHaveLength(2);
    expect(result.current.hasResolvedInitialLoad).toBe(true);

    await act(async () => {
      resolveSecond([reply("r1"), reply("r2"), reply("r3")]);
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.replies).toHaveLength(3));
  });

  test("parentReplyCount が0になったら残留リストをクリアする", async () => {
    getRepliesAPIMock.mockResolvedValueOnce([reply("r1")]);

    const { result, rerender } = renderHook(
      ({ count }) =>
        useReplies({
          parentCommentId: "comment-1",
          parentReplyCount: count,
          currentUserId: "user-1",
          enabled: true,
        }),
      { initialProps: { count: 1 } }
    );

    await waitFor(() => expect(result.current.replies).toHaveLength(1));

    rerender({ count: 0 });

    await waitFor(() => expect(result.current.replies).toHaveLength(0));
    expect(result.current.hasResolvedInitialLoad).toBe(true);
  });

  test("親スレッド切替時はフルリセットして再取得する", async () => {
    getRepliesAPIMock
      .mockResolvedValueOnce([reply("r1")])
      .mockResolvedValueOnce([reply("other-1"), reply("other-2")]);

    const { result, rerender } = renderHook(
      ({ id, count }) =>
        useReplies({
          parentCommentId: id,
          parentReplyCount: count,
          currentUserId: "user-1",
          enabled: true,
        }),
      { initialProps: { id: "comment-1", count: 1 } }
    );

    await waitFor(() => expect(result.current.replies).toHaveLength(1));

    rerender({ id: "comment-2", count: 2 });

    await waitFor(() => expect(result.current.replies).toHaveLength(2));
    expect(getRepliesAPIMock).toHaveBeenLastCalledWith(
      "comment-2",
      expect.any(Number),
      0,
      expect.any(Object)
    );
  });
});
