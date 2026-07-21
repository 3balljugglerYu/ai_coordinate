/** @jest-environment jsdom */

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CommentInput } from "@/features/posts/components/CommentInput";

const createReplyAPIMock = jest.fn();
const createCommentAPIMock = jest.fn();
const toastMock = jest.fn();

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={props.src} alt={props.alt} />
  ),
}));

jest.mock("next/navigation", () => ({
  usePathname: () => "/posts/post-1",
}));

jest.mock("next-intl", () => ({
  useTranslations:
    () =>
    (key: string, values?: Record<string, unknown>) => {
      if (key === "replyToChip") return `@${values?.name} への返信`;
      const T: Record<string, string> = {
        replyToClear: "返信先を解除",
        replySubmit: "返信する",
        anonymousUser: "匿名ユーザー",
        commentRemaining: "残り",
        commentOverLimit: "超過",
      };
      return T[key] ?? key;
    },
}));

jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

jest.mock("@/features/auth/components/AuthModal", () => ({
  AuthModal: () => null,
}));

jest.mock("@/features/posts/lib/api", () => ({
  createReplyAPI: (...args: unknown[]) => createReplyAPIMock(...args),
  createCommentAPI: (...args: unknown[]) => createCommentAPIMock(...args),
}));

jest.mock("@/lib/utils", () => ({
  cn: (...classes: Array<string | false | null | undefined>) =>
    classes.filter(Boolean).join(" "),
  sanitizeProfileText: (value: string) => ({ value }),
  validateProfileText: () => ({ valid: true }),
}));

const REPLY_TO = {
  commentId: "reply-9",
  nickname: "hanako",
  avatarUrl: null,
};

describe("CommentInput 引用チップ", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createReplyAPIMock.mockResolvedValue({ id: "new-reply" });
  });

  test("replyTo指定時_引用チップを表示し解除ボタンでonReplyToClearを呼ぶ", () => {
    const onReplyToClear = jest.fn();
    render(
      <CommentInput
        parentCommentId="comment-1"
        currentUserId="user-1"
        onCommentAdded={jest.fn()}
        replyTo={REPLY_TO}
        onReplyToClear={onReplyToClear}
      />
    );

    expect(screen.getByTestId("reply-to-chip").textContent).toContain(
      "@hanako への返信"
    );

    fireEvent.click(screen.getByRole("button", { name: "返信先を解除" }));
    expect(onReplyToClear).toHaveBeenCalled();
  });

  test("replyTo指定時_送信でreplyToCommentIdを付与してAPIを呼ぶ", async () => {
    render(
      <CommentInput
        parentCommentId="comment-1"
        currentUserId="user-1"
        onCommentAdded={jest.fn()}
        replyTo={REPLY_TO}
      />
    );

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "引用リプライ本文" },
    });
    fireEvent.click(screen.getByRole("button", { name: "返信する" }));

    await waitFor(() => {
      expect(createReplyAPIMock).toHaveBeenCalledWith(
        "comment-1",
        "引用リプライ本文",
        expect.any(Object),
        "reply-9"
      );
    });
  });

  test("replyTo未指定時_チップを出さずreplyToCommentIdはnullで送信する", async () => {
    render(
      <CommentInput
        parentCommentId="comment-1"
        currentUserId="user-1"
        onCommentAdded={jest.fn()}
      />
    );

    expect(screen.queryByTestId("reply-to-chip")).toBeNull();

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "通常の返信" },
    });
    fireEvent.click(screen.getByRole("button", { name: "返信する" }));

    await waitFor(() => {
      expect(createReplyAPIMock).toHaveBeenCalledWith(
        "comment-1",
        "通常の返信",
        expect.any(Object),
        null
      );
    });
  });
});
