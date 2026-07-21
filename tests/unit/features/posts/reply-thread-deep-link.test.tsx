/** @jest-environment jsdom */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { ReplyThread } from "@/features/posts/components/ReplyThread";
import type { ParentComment, ReplyComment } from "@/features/posts/types";

const getRepliesAPIMock = jest.fn();
const scrollIntoViewMock = jest.fn();

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
    return { channel: () => channel, removeChannel: jest.fn() };
  },
}));

jest.mock("@/features/posts/components/CommentInput", () => ({
  CommentInput: () => null,
}));

jest.mock("@/features/posts/components/ReplyItem", () => ({
  ReplyItem: ({
    reply,
    highlighted,
  }: {
    reply: ReplyComment;
    highlighted?: boolean;
  }) => (
    <div data-reply-id={reply.id} data-highlighted={String(Boolean(highlighted))}>
      {reply.content}
    </div>
  ),
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

function parentComment(replyCount: number): ParentComment {
  return {
    id: "comment-1",
    user_id: "user-1",
    image_id: "post-1",
    parent_comment_id: null,
    content: "parent",
    created_at: "2026-04-16T00:00:00.000Z",
    updated_at: "2026-04-16T00:00:00.000Z",
    deleted_at: null,
    last_activity_at: "2026-04-16T00:00:00.000Z",
    reply_count: replyCount,
    user_nickname: "taro",
    user_avatar_url: null,
  };
}

describe("ReplyThread 通知ディープリンク", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Element.prototype.scrollIntoView = scrollIntoViewMock;
  });

  test("deepLinkReplyId指定時_スレッドを自動展開して対象へスクロールしハイライトする", async () => {
    getRepliesAPIMock.mockResolvedValue([reply("r1"), reply("target-reply")]);
    const onConsumed = jest.fn();

    render(
      <ReplyThread
        parentComment={parentComment(2)}
        currentUserId="user-1"
        onThreadChanged={jest.fn()}
        deepLinkReplyId="target-reply"
        onDeepLinkReplyConsumed={onConsumed}
      />
    );

    // 自動展開されて返信が表示される
    await waitFor(() =>
      expect(screen.getByText("reply target-reply")).not.toBeNull()
    );
    await waitFor(() => expect(onConsumed).toHaveBeenCalled());
    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });
    // 対象がハイライトされる(setTimeout 0 経由)
    await waitFor(() =>
      expect(
        document
          .querySelector('[data-reply-id="target-reply"]')
          ?.getAttribute("data-highlighted")
      ).toBe("true")
    );
  });

  test("対象が1ページ目に無い場合_追加読み込みして探す", async () => {
    // 1ページ目(offset 0)は20件(hasMore)、2ページ目(offset 20)に対象。
    // useReplies 内部の件数整合リフレッシュと並走するため、offset ベースで応答する。
    const page1 = Array.from({ length: 20 }, (_, i) => reply(`p1-${i}`));
    getRepliesAPIMock.mockImplementation(
      (_id: string, _limit: number, offset: number) =>
        Promise.resolve(offset >= 20 ? [reply("target-reply")] : page1)
    );
    const onConsumed = jest.fn();

    render(
      <ReplyThread
        parentComment={parentComment(21)}
        currentUserId="user-1"
        onThreadChanged={jest.fn()}
        deepLinkReplyId="target-reply"
        onDeepLinkReplyConsumed={onConsumed}
      />
    );

    await waitFor(() => expect(onConsumed).toHaveBeenCalled());
    // 2ページ目(offset 20)への追加読み込みが行われ、対象までスクロールした
    expect(
      getRepliesAPIMock.mock.calls.some((call) => call[2] === 20)
    ).toBe(true);
    expect(scrollIntoViewMock).toHaveBeenCalled();
  });

  test("対象が見つからない場合_断念してスレッド表示のみ行う", async () => {
    getRepliesAPIMock.mockResolvedValue([reply("r1")]);
    const onConsumed = jest.fn();

    render(
      <ReplyThread
        parentComment={parentComment(1)}
        currentUserId="user-1"
        onThreadChanged={jest.fn()}
        deepLinkReplyId="deleted-reply"
        onDeepLinkReplyConsumed={onConsumed}
      />
    );

    await waitFor(() => expect(onConsumed).toHaveBeenCalled());
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
    // スレッド自体は展開されている
    expect(screen.getByText("reply r1")).not.toBeNull();
  });
});
