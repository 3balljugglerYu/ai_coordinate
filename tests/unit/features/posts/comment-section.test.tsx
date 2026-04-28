/** @jest-environment jsdom */

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CommentSection } from "@/features/posts/components/CommentSection";

const refreshMock = jest.fn();
const visualViewportAddEventListenerMock = jest.fn();
const visualViewportRemoveEventListenerMock = jest.fn();
const resizeObserverObserveMock = jest.fn();
const resizeObserverDisconnectMock = jest.fn();

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("@/features/posts/components/CommentInput", () => ({
  CommentInput: ({ onCommentAdded }: { onCommentAdded?: () => void }) => (
    <button type="button" onClick={() => onCommentAdded?.()}>
      add-comment
    </button>
  ),
}));

jest.mock("@/features/posts/components/CommentComposerTrigger", () => ({
  CommentComposerTrigger: ({
    onCommentAdded,
  }: {
    onCommentAdded?: () => void;
  }) => (
    <button type="button" onClick={() => onCommentAdded?.()}>
      mobile-add-comment
    </button>
  ),
}));

jest.mock("@/features/posts/components/CommentList", () => {
  const { forwardRef, useImperativeHandle } = jest.requireActual("react");

  return {
    CommentList: forwardRef(
      (
        {
          activeReplyCommentId,
          onReplyPanelOpen,
          onReplyPanelOpenChange,
          replyPanelStyle,
        }: {
          activeReplyCommentId?: string | null;
          onReplyPanelOpen?: (commentId: string) => void;
          onReplyPanelOpenChange?: (open: boolean) => void;
          replyPanelStyle?: React.CSSProperties | null;
        },
        ref: React.Ref<{ refresh: () => void }>,
      ) => {
        useImperativeHandle(ref, () => ({
          refresh: refreshMock,
        }));

        return (
          <div>
            <div data-testid="active-reply-comment-id">
              {activeReplyCommentId ?? "none"}
            </div>
            <div data-testid="reply-panel-style">
              {replyPanelStyle ? JSON.stringify(replyPanelStyle) : "none"}
            </div>
            <button
              type="button"
              onClick={() => onReplyPanelOpen?.("parent-comment-1")}
            >
              open-reply-panel
            </button>
            <button
              type="button"
              onClick={() => onReplyPanelOpenChange?.(false)}
            >
              close-reply-panel
            </button>
          </div>
        );
      },
    ),
  };
});

function setSectionRect(
  container: HTMLElement,
  overrides: Partial<DOMRect> = {},
): HTMLDivElement {
  const section = container.querySelector(".container") as HTMLDivElement;
  expect(section).not.toBeNull();

  Object.defineProperty(section, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      top: 240,
      left: 0,
      width: 390,
      height: 900,
      bottom: 1140,
      right: 390,
      x: 0,
      y: 240,
      toJSON: () => ({}),
      ...overrides,
    }),
  });

  return section;
}

describe("CommentSection", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
      writable: true,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 844,
      writable: true,
    });
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: {
        height: 844,
        addEventListener: visualViewportAddEventListenerMock,
        removeEventListener: visualViewportRemoveEventListenerMock,
      },
      writable: true,
    });

    class ResizeObserverMock {
      observe = resizeObserverObserveMock;
      disconnect = resizeObserverDisconnectMock;
    }

    Object.defineProperty(window, "ResizeObserver", {
      configurable: true,
      value: ResizeObserverMock,
      writable: true,
    });
    Object.defineProperty(global, "ResizeObserver", {
      configurable: true,
      value: ResizeObserverMock,
      writable: true,
    });
  });

  test("モバイルで返信を開くとコメント領域の矩形だけをオーバーレイに使う", async () => {
    const { container } = render(
      <CommentSection postId="post-1" currentUserId="user-1" />,
    );

    setSectionRect(container);

    fireEvent.click(screen.getByRole("button", { name: "open-reply-panel" }));

    await waitFor(() => {
      expect(screen.getByTestId("active-reply-comment-id")).toHaveTextContent(
        "parent-comment-1",
      );
      expect(screen.getByTestId("reply-panel-style")).toHaveTextContent(
        JSON.stringify({
          top: 240,
          left: 0,
          width: 390,
          height: 604,
        }),
      );
    });

    expect(visualViewportAddEventListenerMock).toHaveBeenCalledWith(
      "resize",
      expect.any(Function),
    );
    expect(visualViewportAddEventListenerMock).toHaveBeenCalledWith(
      "scroll",
      expect.any(Function),
    );
    expect(resizeObserverObserveMock).toHaveBeenCalled();
  });

  test("デスクトップ幅では返信パネルのスタイルを計算しない", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1024,
      writable: true,
    });

    const { container } = render(
      <CommentSection postId="post-1" currentUserId="user-1" />,
    );

    setSectionRect(container, { width: 960, right: 960 });

    fireEvent.click(screen.getByRole("button", { name: "open-reply-panel" }));

    await waitFor(() => {
      expect(screen.getByTestId("active-reply-comment-id")).toHaveTextContent(
        "parent-comment-1",
      );
      expect(screen.getByTestId("reply-panel-style")).toHaveTextContent("none");
    });
  });

  test("計測結果が無効な場合は返信パネルのスタイルを設定しない", async () => {
    const { container } = render(
      <CommentSection postId="post-1" currentUserId="user-1" />,
    );

    setSectionRect(container, {
      width: 0,
      right: 0,
    });

    fireEvent.click(screen.getByRole("button", { name: "open-reply-panel" }));

    await waitFor(() => {
      expect(screen.getByTestId("active-reply-comment-id")).toHaveTextContent(
        "parent-comment-1",
      );
      expect(screen.getByTestId("reply-panel-style")).toHaveTextContent("none");
    });
  });

  test("visualViewport や ResizeObserver がなくても innerHeight でスタイルを計算できる", async () => {
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: undefined,
      writable: true,
    });
    Object.defineProperty(window, "ResizeObserver", {
      configurable: true,
      value: undefined,
      writable: true,
    });
    Object.defineProperty(global, "ResizeObserver", {
      configurable: true,
      value: undefined,
      writable: true,
    });

    const { container } = render(
      <CommentSection postId="post-1" currentUserId="user-1" />,
    );

    setSectionRect(container, {
      top: 100,
      y: 100,
      height: 600,
      bottom: 700,
    });

    fireEvent.click(screen.getByRole("button", { name: "open-reply-panel" }));

    await waitFor(() => {
      expect(screen.getByTestId("reply-panel-style")).toHaveTextContent(
        JSON.stringify({
          top: 100,
          left: 0,
          width: 390,
          height: 744,
        }),
      );
    });
  });

  test("返信パネルを閉じるとアクティブ状態とスタイルをクリアして cleanup する", async () => {
    const { container } = render(
      <CommentSection postId="post-1" currentUserId="user-1" />,
    );

    setSectionRect(container);

    fireEvent.click(screen.getByRole("button", { name: "open-reply-panel" }));

    await waitFor(() => {
      expect(screen.getByTestId("active-reply-comment-id")).toHaveTextContent(
        "parent-comment-1",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "close-reply-panel" }));

    await waitFor(() => {
      expect(screen.getByTestId("active-reply-comment-id")).toHaveTextContent(
        "none",
      );
      expect(screen.getByTestId("reply-panel-style")).toHaveTextContent("none");
    });

    expect(visualViewportRemoveEventListenerMock).toHaveBeenCalledWith(
      "resize",
      expect.any(Function),
    );
    expect(visualViewportRemoveEventListenerMock).toHaveBeenCalledWith(
      "scroll",
      expect.any(Function),
    );
    expect(resizeObserverDisconnectMock).toHaveBeenCalled();
  });

  test("ビューポート変更時に返信パネルのスタイルを再計算する", async () => {
    const { container } = render(
      <CommentSection postId="post-1" currentUserId="user-1" />,
    );

    const section = setSectionRect(container);
    fireEvent.click(screen.getByRole("button", { name: "open-reply-panel" }));

    await waitFor(() => {
      expect(screen.getByTestId("reply-panel-style")).toHaveTextContent(
        JSON.stringify({
          top: 240,
          left: 0,
          width: 390,
          height: 604,
        }),
      );
    });

    Object.defineProperty(section, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        top: 180,
        left: 12,
        width: 360,
        height: 900,
        bottom: 1080,
        right: 372,
        x: 12,
        y: 180,
        toJSON: () => ({}),
      }),
    });

    fireEvent(window, new Event("resize"));

    await waitFor(() => {
      expect(screen.getByTestId("reply-panel-style")).toHaveTextContent(
        JSON.stringify({
          top: 180,
          left: 12,
          width: 360,
          height: 664,
        }),
      );
    });
  });

  test("コメント追加後に一覧を refresh する", () => {
    render(<CommentSection postId="post-1" currentUserId="user-1" />);

    fireEvent.click(screen.getByRole("button", { name: "add-comment" }));

    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  test("モバイル trigger 経由のコメント追加でも一覧を refresh する", () => {
    render(<CommentSection postId="post-1" currentUserId="user-1" />);

    fireEvent.click(screen.getByRole("button", { name: "mobile-add-comment" }));

    expect(refreshMock).toHaveBeenCalledTimes(1);
  });
});
