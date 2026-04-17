/** @jest-environment jsdom */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { useTranslations } from "next-intl";
import { CommentItem } from "@/features/posts/components/CommentItem";
import type { ParentComment } from "@/features/posts/types";

jest.mock("next-intl", () => ({
  useTranslations: jest.fn(),
}));

jest.mock("@/features/posts/components/EditableComment", () => ({
  EditableComment: ({
    onCommentSelected,
  }: {
    onCommentSelected?: () => void;
  }) => (
    <button type="button" onClick={onCommentSelected}>
      select-comment
    </button>
  ),
}));

jest.mock("@/features/posts/components/ReplyThread", () => ({
  ReplyThread: () => <div data-testid="reply-thread" />,
}));

const useTranslationsMock = useTranslations as jest.MockedFunction<
  typeof useTranslations
>;

function createComment(overrides: Partial<ParentComment> = {}): ParentComment {
  return {
    id: "comment-1",
    user_id: "user-1",
    image_id: "post-1",
    parent_comment_id: null,
    content: "comment body",
    created_at: "2026-04-17T00:00:00.000Z",
    updated_at: "2026-04-17T00:00:00.000Z",
    deleted_at: null,
    user_nickname: "User",
    user_avatar_url: null,
    reply_count: 0,
    last_activity_at: "2026-04-17T00:00:00.000Z",
    ...overrides,
  };
}

describe("CommentItem", () => {
  beforeEach(() => {
    useTranslationsMock.mockImplementation((namespace?: string) => {
      return ((key: string, values?: Record<string, string | number>) => {
        if (namespace !== "posts") {
          return key;
        }

        if (key === "repliesCount") {
          return `${values?.count}件の返信`;
        }

        return key;
      }) as ReturnType<typeof useTranslations>;
    });
  });

  test("返信がない場合は返信数ボタンを表示しない", () => {
    render(
      <CommentItem
        comment={createComment({ reply_count: 0 })}
        currentUserId="viewer-1"
        onCommentUpdated={() => undefined}
        onCommentDeleted={() => undefined}
        onThreadChanged={() => undefined}
        onOpenReplyPanel={() => undefined}
      />,
    );

    expect(screen.queryByText("0件の返信")).not.toBeInTheDocument();
  });

  test("コメント本体の選択で返信画面を開ける", () => {
    const onOpenReplyPanel = jest.fn();

    render(
      <CommentItem
        comment={createComment({ reply_count: 0 })}
        currentUserId="viewer-1"
        onCommentUpdated={() => undefined}
        onCommentDeleted={() => undefined}
        onThreadChanged={() => undefined}
        onOpenReplyPanel={onOpenReplyPanel}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "select-comment" }));

    expect(onOpenReplyPanel).toHaveBeenCalledTimes(1);
  });

  test("削除済みコメントは本体選択で返信画面を開かない", () => {
    const onOpenReplyPanel = jest.fn();

    render(
      <CommentItem
        comment={createComment({
          deleted_at: "2026-04-17T00:10:00.000Z",
          reply_count: 2,
        })}
        currentUserId="viewer-1"
        onCommentUpdated={() => undefined}
        onCommentDeleted={() => undefined}
        onThreadChanged={() => undefined}
        onOpenReplyPanel={onOpenReplyPanel}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "select-comment" }));

    expect(onOpenReplyPanel).not.toHaveBeenCalled();
    expect(screen.getByText("2件の返信")).toBeInTheDocument();
  });
});
