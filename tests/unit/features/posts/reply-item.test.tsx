/** @jest-environment jsdom */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ReplyItem } from "@/features/posts/components/ReplyItem";
import type { ReplyComment } from "@/features/posts/types";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const T: Record<string, string> = { replyAction: "返信する" };
    return T[key] ?? key;
  },
}));

jest.mock("@/features/posts/components/EditableComment", () => ({
  EditableComment: ({ comment }: { comment: { content: string } }) => (
    <div>{comment.content}</div>
  ),
}));

function reply(overrides: Partial<ReplyComment> = {}): ReplyComment {
  return {
    id: "reply-1",
    user_id: "user-1",
    image_id: "post-1",
    parent_comment_id: "comment-1",
    reply_to_comment_id: null,
    reply_to_deleted: false,
    reply_to: null,
    content: "返信本文",
    created_at: "2026-04-16T00:00:00.000Z",
    updated_at: "2026-04-16T00:00:00.000Z",
    deleted_at: null,
    user_nickname: "taro",
    user_avatar_url: "https://example.com/a.webp",
    ...overrides,
  };
}

describe("ReplyItem", () => {
  test("onQuoteReply指定時_返信するボタンを表示し引用先情報で呼び出す", () => {
    const onQuoteReply = jest.fn();
    render(
      <ReplyItem
        reply={reply()}
        onReplyUpdated={jest.fn()}
        onReplyDeleted={jest.fn()}
        onQuoteReply={onQuoteReply}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "返信する" }));

    expect(onQuoteReply).toHaveBeenCalledWith({
      commentId: "reply-1",
      nickname: "taro",
      avatarUrl: "https://example.com/a.webp",
    });
  });

  test("onQuoteReply未指定時_返信するボタンを表示しない", () => {
    render(
      <ReplyItem
        reply={reply()}
        onReplyUpdated={jest.fn()}
        onReplyDeleted={jest.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: "返信する" })).toBeNull();
  });

  test("削除済み返信には返信するボタンを表示しない", () => {
    render(
      <ReplyItem
        reply={reply({ deleted_at: "2026-04-17T00:00:00.000Z" })}
        onReplyUpdated={jest.fn()}
        onReplyDeleted={jest.fn()}
        onQuoteReply={jest.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: "返信する" })).toBeNull();
  });
});
