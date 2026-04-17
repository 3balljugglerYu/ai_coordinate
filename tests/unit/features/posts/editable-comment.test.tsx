/** @jest-environment jsdom */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { useLocale, useTranslations } from "next-intl";
import { EditableComment } from "@/features/posts/components/EditableComment";
import type { ParentComment } from "@/features/posts/types";

const updateCommentAPIMock = jest.fn();
const deleteCommentAPIMock = jest.fn();
const toastMock = jest.fn();

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={props.src} alt={props.alt} />
  ),
}));

jest.mock("next-intl", () => ({
  useLocale: jest.fn(),
  useTranslations: jest.fn(),
}));

jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

jest.mock("@/features/posts/lib/api", () => ({
  updateCommentAPI: (...args: unknown[]) => updateCommentAPIMock(...args),
  deleteCommentAPI: (...args: unknown[]) => deleteCommentAPIMock(...args),
}));

jest.mock("@/features/posts/components/CollapsibleText", () => ({
  CollapsibleText: ({ text }: { text: string }) => <span>{text}</span>,
}));

jest.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

jest.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({
    children,
    open,
  }: {
    children: React.ReactNode;
    open?: boolean;
  }) => (
    <div>{open ? children : null}</div>
  ),
  AlertDialogAction: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  AlertDialogCancel: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const useLocaleMock = useLocale as jest.MockedFunction<typeof useLocale>;
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

describe("EditableComment", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
      writable: true,
    });

    useLocaleMock.mockReturnValue("ja");
    useTranslationsMock.mockImplementation(() => {
      return ((key: string) => key) as ReturnType<typeof useTranslations>;
    });
  });

  test("選択可能なコメント領域に button semantics を付与する", () => {
    render(
      <EditableComment
        comment={createComment()}
        currentUserId="viewer-1"
        onCommentUpdated={() => undefined}
        onCommentDeleted={() => undefined}
        onCommentSelected={() => undefined}
      />,
    );

    const trigger = screen.getByRole("button");

    expect(trigger).toHaveAttribute("tabindex", "0");
  });

  test("Enter キーで返信画面を開く", () => {
    const onCommentSelected = jest.fn();

    render(
      <EditableComment
        comment={createComment()}
        currentUserId="viewer-1"
        onCommentUpdated={() => undefined}
        onCommentDeleted={() => undefined}
        onCommentSelected={onCommentSelected}
      />,
    );

    fireEvent.keyDown(screen.getByRole("button"), { key: "Enter" });

    expect(onCommentSelected).toHaveBeenCalledTimes(1);
  });

  test("Space キーで返信画面を開く", () => {
    const onCommentSelected = jest.fn();

    render(
      <EditableComment
        comment={createComment()}
        currentUserId="viewer-1"
        onCommentUpdated={() => undefined}
        onCommentDeleted={() => undefined}
        onCommentSelected={onCommentSelected}
      />,
    );

    fireEvent.keyDown(screen.getByRole("button"), { key: " " });

    expect(onCommentSelected).toHaveBeenCalledTimes(1);
  });

  test("選択不可のコメント領域は button semantics を持たない", () => {
    render(
      <EditableComment
        comment={createComment({ deleted_at: "2026-04-17T00:10:00.000Z" })}
        currentUserId="viewer-1"
        onCommentUpdated={() => undefined}
        onCommentDeleted={() => undefined}
      />,
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
