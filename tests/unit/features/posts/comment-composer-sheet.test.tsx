/** @jest-environment jsdom */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { CommentComposerSheet } from "@/features/posts/components/CommentComposerSheet";

type CommentInputMockProps = {
  onCommentAdded?: () => void;
  onCancel?: () => void;
  autoFocus?: boolean;
};

const commentInputProps: CommentInputMockProps = {};

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    key === "commentSheetClose" ? "閉じる" : key,
}));

jest.mock("@/features/posts/components/CommentInput", () => ({
  CommentInput: (props: CommentInputMockProps) => {
    Object.assign(commentInputProps, props);
    return (
      <div data-testid="comment-input" data-autofocus={String(!!props.autoFocus)}>
        <button type="button" onClick={() => props.onCommentAdded?.()}>
          fire-success
        </button>
        <button
          type="button"
          onClick={() => props.onCommentAdded?.()}
          data-testid="success-without-cancel"
        >
          fire-success-no-cancel
        </button>
        <button type="button" onClick={() => props.onCancel?.()}>
          fire-cancel
        </button>
      </div>
    );
  },
}));

describe("CommentComposerSheet", () => {
  beforeEach(() => {
    Object.keys(commentInputProps).forEach(
      (key) => delete (commentInputProps as Record<string, unknown>)[key],
    );
  });

  test("open=false のとき CommentInput は mount されない", () => {
    render(
      <CommentComposerSheet
        open={false}
        onOpenChange={jest.fn()}
        title="コメントを追加"
        onCommentAdded={jest.fn()}
      />,
    );

    expect(screen.queryByTestId("comment-input")).not.toBeInTheDocument();
  });

  test("open=true のとき autoFocus 付きで CommentInput を mount する", () => {
    render(
      <CommentComposerSheet
        open
        onOpenChange={jest.fn()}
        title="コメントを追加"
        onCommentAdded={jest.fn()}
      />,
    );

    const input = screen.getByTestId("comment-input");
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("data-autofocus", "true");
  });

  test("cancel すると onOpenChange(false) が呼ばれる", () => {
    const onOpenChange = jest.fn();
    render(
      <CommentComposerSheet
        open
        onOpenChange={onOpenChange}
        title="コメントを追加"
        onCommentAdded={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "fire-cancel" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test("header の閉じるボタンで onOpenChange(false) が呼ばれる", () => {
    const onOpenChange = jest.fn();
    render(
      <CommentComposerSheet
        open
        onOpenChange={onOpenChange}
        title="コメントを追加"
        onCommentAdded={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test("submit 成功時に onCommentAdded を呼んだ後 Sheet を閉じる", () => {
    const onOpenChange = jest.fn();
    const onCommentAdded = jest.fn();
    render(
      <CommentComposerSheet
        open
        onOpenChange={onOpenChange}
        title="コメントを追加"
        onCommentAdded={onCommentAdded}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "fire-success" }));

    expect(onCommentAdded).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onCommentAdded.mock.invocationCallOrder[0]).toBeLessThan(
      onOpenChange.mock.invocationCallOrder[0],
    );
  });

  test("CommentInput が onCancel を呼ばない場合でも onCommentAdded 経由で閉じる", () => {
    const onOpenChange = jest.fn();
    const onCommentAdded = jest.fn();
    render(
      <CommentComposerSheet
        open
        onOpenChange={onOpenChange}
        title="コメントを追加"
        onCommentAdded={onCommentAdded}
      />,
    );

    fireEvent.click(screen.getByTestId("success-without-cancel"));

    expect(onCommentAdded).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
