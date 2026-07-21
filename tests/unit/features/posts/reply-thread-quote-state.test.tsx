/** @jest-environment jsdom */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ReplyThread } from "@/features/posts/components/ReplyThread";
import type { ParentComment, ReplyToTarget } from "@/features/posts/types";

const refreshRepliesMock = jest.fn();

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("@/features/posts/hooks/useReplies", () => ({
  useReplies: () => ({
    replies: [
      {
        id: "reply-1",
        user_nickname: "hanako",
        user_avatar_url: null,
        deleted_at: null,
      },
    ],
    isLoading: false,
    hasMore: false,
    offset: 1,
    loadReplies: jest.fn(),
    refreshReplies: refreshRepliesMock,
  }),
}));

// CommentInput は受け取った props を可視化し、コールバックをボタンで発火できるようにする。
const commentInputProps: Array<Record<string, unknown>> = [];
jest.mock("@/features/posts/components/CommentInput", () => ({
  CommentInput: (props: {
    replyTo?: ReplyToTarget | null;
    onReplyToClear?: () => void;
    onCancel?: () => void;
    onCommentAdded: () => void;
  }) => {
    commentInputProps.push(props as Record<string, unknown>);
    return (
      <div data-testid="composer" data-reply-to={props.replyTo?.commentId ?? ""}>
        <button type="button" onClick={props.onReplyToClear}>
          clear-quote
        </button>
        <button type="button" onClick={props.onCancel}>
          cancel-composer
        </button>
        <button type="button" onClick={props.onCommentAdded}>
          submit-success
        </button>
      </div>
    );
  },
}));

jest.mock("@/features/posts/components/ReplyItem", () => ({
  ReplyItem: ({
    onQuoteReply,
  }: {
    onQuoteReply?: (target: ReplyToTarget) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onQuoteReply?.({
          commentId: "reply-1",
          nickname: "hanako",
          avatarUrl: null,
        })
      }
    >
      quote-reply-button
    </button>
  ),
}));

function parentComment(): ParentComment {
  return {
    id: "comment-1",
    user_id: "user-1",
    image_id: "post-1",
    parent_comment_id: null,
    content: "親コメント",
    created_at: "2026-04-16T00:00:00.000Z",
    updated_at: "2026-04-16T00:00:00.000Z",
    deleted_at: null,
    last_activity_at: "2026-04-16T00:00:00.000Z",
    reply_count: 1,
    user_nickname: "taro",
    user_avatar_url: null,
  };
}

function setup() {
  commentInputProps.length = 0;
  render(
    <ReplyThread
      parentComment={parentComment()}
      currentUserId="user-1"
      onThreadChanged={jest.fn()}
    />
  );
  // 返信一覧を展開して ReplyItem(quote-reply-button)を表示する
  fireEvent.click(screen.getByRole("button", { name: "showReplies" }));
}

function composer() {
  return screen.queryByTestId("composer");
}

describe("ReplyThread 引用状態遷移(デスクトップ)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("返信の返信するで引用付きコンポーザーが開く", () => {
    setup();
    expect(composer()).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "quote-reply-button" }));

    expect(composer()?.getAttribute("data-reply-to")).toBe("reply-1");
  });

  test("引用リプライのコンポーザーは引用した返信の下に表示される", () => {
    setup();
    const quoteButton = screen.getByRole("button", {
      name: "quote-reply-button",
    });
    fireEvent.click(quoteButton);

    const composerEl = composer();
    expect(composerEl).not.toBeNull();
    // DOM順で「引用した返信(のボタン)」の後にコンポーザーが来ること。
    const position = quoteButton.compareDocumentPosition(composerEl!);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test("引用チップ解除でコンポーザーは開いたまま通常返信になる", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "quote-reply-button" }));
    fireEvent.click(screen.getByRole("button", { name: "clear-quote" }));

    expect(composer()).not.toBeNull();
    expect(composer()?.getAttribute("data-reply-to")).toBe("");
  });

  test("キャンセルでコンポーザーが閉じ、次に親返信で開くと引用は残らない", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "quote-reply-button" }));
    fireEvent.click(screen.getByRole("button", { name: "cancel-composer" }));
    expect(composer()).toBeNull();

    // 親コメントへの通常返信ボタン(replyAction)で開き直す
    fireEvent.click(screen.getByRole("button", { name: "replyAction" }));
    expect(composer()?.getAttribute("data-reply-to")).toBe("");
  });

  test("送信成功でコンポーザーが閉じ引用状態もクリアされる", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "quote-reply-button" }));
    fireEvent.click(screen.getByRole("button", { name: "submit-success" }));

    expect(composer()).toBeNull();
    expect(refreshRepliesMock).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "replyAction" }));
    expect(composer()?.getAttribute("data-reply-to")).toBe("");
  });
});
