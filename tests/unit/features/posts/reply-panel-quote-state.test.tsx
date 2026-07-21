/** @jest-environment jsdom */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ReplyPanel } from "@/features/posts/components/ReplyPanel";
import type { ParentComment, ReplyToTarget } from "@/features/posts/types";

const refreshRepliesMock = jest.fn();

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("@radix-ui/react-dialog", () => ({
  Root: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Portal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Overlay: () => null,
  Content: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Title: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Close: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
    hasResolvedInitialLoad: true,
    loadReplies: jest.fn(),
    refreshReplies: refreshRepliesMock,
  }),
}));

jest.mock("@/features/posts/components/EditableComment", () => ({
  EditableComment: () => <div data-testid="parent-comment" />,
}));

jest.mock("@/features/posts/components/ReplyPanelSkeleton", () => ({
  ReplyPanelSkeleton: () => null,
}));

jest.mock("@/features/posts/components/CommentComposerTrigger", () => ({
  CommentComposerTrigger: () => <div data-testid="normal-composer-trigger" />,
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

// 引用用シート: open/replyTo を可視化し、各コールバックをボタンで発火できるようにする。
jest.mock("@/features/posts/components/CommentComposerSheet", () => ({
  CommentComposerSheet: (props: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCommentAdded: () => void;
    replyTo?: ReplyToTarget | null;
    onReplyToClear?: () => void;
  }) => (
    <div
      data-testid="quote-sheet"
      data-open={String(props.open)}
      data-reply-to={props.replyTo?.commentId ?? ""}
    >
      <button type="button" onClick={() => props.onOpenChange(false)}>
        close-sheet
      </button>
      <button type="button" onClick={props.onReplyToClear}>
        clear-quote
      </button>
      <button type="button" onClick={props.onCommentAdded}>
        submit-success
      </button>
    </div>
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
  render(
    <ReplyPanel
      open
      onOpenChange={jest.fn()}
      parentComment={parentComment()}
      currentUserId="user-1"
      onThreadChanged={jest.fn()}
      panelStyle={{}}
    />
  );
}

function quoteSheet() {
  return screen.getByTestId("quote-sheet");
}

describe("ReplyPanel 引用状態遷移(モバイル)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("初期状態では引用シートは閉じている", () => {
    setup();
    expect(quoteSheet().getAttribute("data-open")).toBe("false");
  });

  test("返信の返信するで引用先付きでシートが開く", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "quote-reply-button" }));

    expect(quoteSheet().getAttribute("data-open")).toBe("true");
    expect(quoteSheet().getAttribute("data-reply-to")).toBe("reply-1");
  });

  test("引用チップ解除でシートは開いたまま通常返信になる", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "quote-reply-button" }));
    fireEvent.click(screen.getByRole("button", { name: "clear-quote" }));

    expect(quoteSheet().getAttribute("data-open")).toBe("true");
    expect(quoteSheet().getAttribute("data-reply-to")).toBe("");
  });

  test("シートを閉じる(キャンセル)と引用状態もクリアされる", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "quote-reply-button" }));
    fireEvent.click(screen.getByRole("button", { name: "close-sheet" }));

    expect(quoteSheet().getAttribute("data-open")).toBe("false");
    expect(quoteSheet().getAttribute("data-reply-to")).toBe("");
  });

  test("送信成功でシートが閉じ引用状態がクリアされ一覧が更新される", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "quote-reply-button" }));
    fireEvent.click(screen.getByRole("button", { name: "submit-success" }));

    expect(quoteSheet().getAttribute("data-open")).toBe("false");
    expect(quoteSheet().getAttribute("data-reply-to")).toBe("");
    expect(refreshRepliesMock).toHaveBeenCalled();
  });
});
