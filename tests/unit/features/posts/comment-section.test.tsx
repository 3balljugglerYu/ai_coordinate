/** @jest-environment jsdom */

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CommentSection } from "@/features/posts/components/CommentSection";

const refreshMock = jest.fn();

jest.mock("@/features/posts/components/CommentInput", () => ({
  CommentInput: () => <div data-testid="comment-input" />,
}));

jest.mock("@/features/posts/components/CommentList", () => {
  const { forwardRef, useImperativeHandle } = jest.requireActual("react");

  return {
    CommentList: forwardRef(
      (
        {
          activeReplyCommentId,
          onReplyPanelOpen,
          replyPanelStyle,
        }: {
          activeReplyCommentId?: string | null;
          onReplyPanelOpen?: (commentId: string) => void;
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
          </div>
        );
      },
    ),
  };
});

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
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
      writable: true,
    });

    class ResizeObserverMock {
      observe = jest.fn();
      disconnect = jest.fn();
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
      }),
    });

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
  });
});
