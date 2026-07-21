/** @jest-environment jsdom */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { CommentSection } from "@/features/posts/components/CommentSection";
import type { CommentDeepLink } from "@/features/posts/components/CommentList";

const searchParamsMock = new Map<string, string>();

jest.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: (key: string) => searchParamsMock.get(key) ?? null,
  }),
}));

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("@/features/posts/components/CommentInput", () => ({
  CommentInput: () => null,
}));

jest.mock("@/features/posts/components/CommentComposerTrigger", () => ({
  CommentComposerTrigger: () => null,
}));

// CommentList は受け取った deepLink を可視化し、消費コールバックを発火できるようにする。
jest.mock("@/features/posts/components/CommentList", () => ({
  CommentList: React.forwardRef(function CommentListMock({
    deepLink,
    onDeepLinkConsumed,
  }: {
    deepLink?: CommentDeepLink | null;
    onDeepLinkConsumed?: () => void;
  }) {
    return (
      <div
        data-testid="comment-list"
        data-deep-comment={deepLink?.commentId ?? ""}
        data-deep-reply={deepLink?.replyId ?? ""}
      >
        <button type="button" onClick={onDeepLinkConsumed}>
          consume-deep-link
        </button>
      </div>
    );
  }),
}));

describe("CommentSection 通知ディープリンク", () => {
  beforeEach(() => {
    searchParamsMock.clear();
  });

  test("comment/replyパラメータをCommentListへ渡し、消費後にURLから除去する", () => {
    searchParamsMock.set("comment", "parent-1");
    searchParamsMock.set("reply", "reply-9");
    window.history.replaceState(
      null,
      "",
      "/posts/post-1?from=notifications&comment=parent-1&reply=reply-9"
    );

    render(<CommentSection postId="post-1" currentUserId="user-1" />);

    const list = screen.getByTestId("comment-list");
    expect(list.getAttribute("data-deep-comment")).toBe("parent-1");
    expect(list.getAttribute("data-deep-reply")).toBe("reply-9");

    fireEvent.click(screen.getByRole("button", { name: "consume-deep-link" }));

    // deepLink がクリアされ、URL からパラメータが除去される(from は残る)
    expect(list.getAttribute("data-deep-comment")).toBe("");
    expect(window.location.search).toBe("?from=notifications");
  });

  test("commentパラメータが無い場合_deepLinkはnullのまま", () => {
    window.history.replaceState(null, "", "/posts/post-1");

    render(<CommentSection postId="post-1" currentUserId="user-1" />);

    const list = screen.getByTestId("comment-list");
    expect(list.getAttribute("data-deep-comment")).toBe("");
    expect(list.getAttribute("data-deep-reply")).toBe("");
  });

  test("replyなしのcommentパラメータのみでも取り込む", () => {
    searchParamsMock.set("comment", "parent-1");
    window.history.replaceState(null, "", "/posts/post-1?comment=parent-1");

    render(<CommentSection postId="post-1" currentUserId="user-1" />);

    const list = screen.getByTestId("comment-list");
    expect(list.getAttribute("data-deep-comment")).toBe("parent-1");
    expect(list.getAttribute("data-deep-reply")).toBe("");
  });
});
