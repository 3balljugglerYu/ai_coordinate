/** @jest-environment jsdom */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { CommentSection } from "@/features/posts/components/CommentSection";
import type { CommentDeepLink } from "@/features/posts/components/CommentList";

// 実際の useSearchParams と同様に「現在の URL」を返す。
// CommentSection は URL 清掃(replaceState)後のパラメータを再取り込み
// しないこと、再遷移で再び付与されたら取り込むことをこれで検証できる。
jest.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: (key: string) => new URLSearchParams(window.location.search).get(key),
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
jest.mock("@/features/posts/components/CommentList", () => {
  const { forwardRef, useImperativeHandle } = jest.requireActual("react");

  return {
    CommentList: forwardRef(function CommentListMock(
      {
        deepLink,
        onDeepLinkConsumed,
      }: {
        deepLink?: CommentDeepLink | null;
        onDeepLinkConsumed?: () => void;
      },
      ref: React.Ref<{ refresh: () => void }>,
    ) {
      useImperativeHandle(ref, () => ({ refresh: jest.fn() }));

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
  };
});

describe("CommentSection 通知ディープリンク", () => {
  test("comment/replyパラメータをCommentListへ渡し、消費後にURLから除去する", () => {
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
    window.history.replaceState(null, "", "/posts/post-1?comment=parent-1");

    render(<CommentSection postId="post-1" currentUserId="user-1" />);

    const list = screen.getByTestId("comment-list");
    expect(list.getAttribute("data-deep-comment")).toBe("parent-1");
    expect(list.getAttribute("data-deep-reply")).toBe("");
  });

  test("消費後に再遷移でパラメータが再付与されたら_再取り込みする(回帰)", () => {
    // 通知一覧から同じ投稿へ再遷移すると、コンポーネントは再マウント
    // されず searchParams だけが変わる。初期化子方式では2回目を
    // 取りこぼすため、effect での再取り込みを検証する。
    window.history.replaceState(
      null,
      "",
      "/posts/post-1?from=notifications&comment=parent-1&reply=reply-9"
    );

    const { rerender } = render(
      <CommentSection postId="post-1" currentUserId="user-1" />
    );
    const list = screen.getByTestId("comment-list");

    // 1回目の取り込みと消費
    fireEvent.click(screen.getByRole("button", { name: "consume-deep-link" }));
    expect(list.getAttribute("data-deep-comment")).toBe("");

    // 再遷移(再マウントなしで URL のみ変化)を模す
    window.history.replaceState(
      null,
      "",
      "/posts/post-1?from=notifications&comment=parent-1&reply=reply-9"
    );
    rerender(<CommentSection postId="post-1" currentUserId="user-1" />);

    expect(list.getAttribute("data-deep-comment")).toBe("parent-1");
    expect(list.getAttribute("data-deep-reply")).toBe("reply-9");
  });
});
