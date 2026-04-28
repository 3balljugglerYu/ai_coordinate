/** @jest-environment jsdom */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { CommentComposerTrigger } from "@/features/posts/components/CommentComposerTrigger";

const sheetOpenSpy = jest.fn();
const authModalOpenSpy = jest.fn();

jest.mock("next/navigation", () => ({
  usePathname: () => "/posts/post-1",
}));

jest.mock("@/features/posts/components/CommentComposerSheet", () => ({
  CommentComposerSheet: ({
    open,
    onCommentAdded,
  }: {
    open: boolean;
    onCommentAdded?: () => void;
  }) => {
    sheetOpenSpy(open);
    return open ? (
      <div data-testid="composer-sheet">
        <button type="button" onClick={() => onCommentAdded?.()}>
          submit-from-sheet
        </button>
      </div>
    ) : null;
  },
}));

jest.mock("@/features/auth/components/AuthModal", () => ({
  AuthModal: ({
    open,
    onClose,
    redirectTo,
  }: {
    open: boolean;
    onClose: () => void;
    redirectTo?: string;
  }) => {
    authModalOpenSpy(open, redirectTo);
    return open ? (
      <div data-testid="auth-modal" data-redirect-to={redirectTo}>
        <button type="button" onClick={onClose}>
          close-auth-modal
        </button>
      </div>
    ) : null;
  },
}));

describe("CommentComposerTrigger", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("認証済みユーザーがタップすると Sheet が開く", () => {
    render(
      <CommentComposerTrigger
        imageId="post-1"
        currentUserId="user-1"
        onCommentAdded={jest.fn()}
        placeholder="コメントを入力..."
        triggerLabel="コメントを入力..."
        sheetTitle="コメントを追加"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "コメントを入力..." }));

    expect(screen.getByTestId("composer-sheet")).toBeInTheDocument();
    expect(screen.queryByTestId("auth-modal")).not.toBeInTheDocument();
  });

  test("未認証ユーザーがタップすると AuthModal が開き、Sheet は開かない", () => {
    render(
      <CommentComposerTrigger
        imageId="post-1"
        currentUserId={null}
        onCommentAdded={jest.fn()}
        placeholder="コメントを入力..."
        triggerLabel="コメントを入力..."
        sheetTitle="コメントを追加"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "コメントを入力..." }));

    const authModal = screen.getByTestId("auth-modal");
    expect(authModal).toBeInTheDocument();
    expect(authModal).toHaveAttribute("data-redirect-to", "/posts/post-1");
    expect(screen.queryByTestId("composer-sheet")).not.toBeInTheDocument();
  });

  test("AuthModal の onClose で認証モーダルが閉じる", () => {
    render(
      <CommentComposerTrigger
        imageId="post-1"
        currentUserId={null}
        onCommentAdded={jest.fn()}
        placeholder="コメントを入力..."
        triggerLabel="コメントを入力..."
        sheetTitle="コメントを追加"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "コメントを入力..." }));
    expect(screen.getByTestId("auth-modal")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "close-auth-modal" }));

    expect(screen.queryByTestId("auth-modal")).not.toBeInTheDocument();
  });

  test("disabled の時はタップしても Sheet も AuthModal も開かない", () => {
    render(
      <CommentComposerTrigger
        imageId="post-1"
        currentUserId={null}
        onCommentAdded={jest.fn()}
        placeholder="返信を入力..."
        triggerLabel="返信を入力..."
        sheetTitle="返信を追加"
        disabled
        disabledMessage="削除されたコメントには返信できません"
      />,
    );

    const button = screen.getByRole("button", { name: "返信を入力..." });
    expect(button).toBeDisabled();

    fireEvent.click(button);

    expect(screen.queryByTestId("composer-sheet")).not.toBeInTheDocument();
    expect(screen.queryByTestId("auth-modal")).not.toBeInTheDocument();
    expect(
      screen.getByText("削除されたコメントには返信できません"),
    ).toBeInTheDocument();
  });
});
