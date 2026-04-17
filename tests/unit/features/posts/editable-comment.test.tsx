/** @jest-environment jsdom */

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useLocale, useTranslations } from "next-intl";
import { EditableComment } from "@/features/posts/components/EditableComment";
import type { ParentComment } from "@/features/posts/types";

const updateCommentAPIMock = jest.fn();
const deleteCommentAPIMock = jest.fn();
const sanitizeProfileTextMock = jest.fn();
const toastMock = jest.fn();
const validateProfileTextMock = jest.fn();

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

jest.mock("@/lib/utils", () => ({
  cn: (...classes: Array<string | false | null | undefined>) =>
    classes.filter(Boolean).join(" "),
  sanitizeProfileText: (...args: unknown[]) => sanitizeProfileTextMock(...args),
  validateProfileText: (...args: unknown[]) => validateProfileTextMock(...args),
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
  AlertDialogAction: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  AlertDialogCancel: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
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

function getSelectionTrigger() {
  const trigger = screen.getByText("comment body").closest("[role='button']");
  expect(trigger).not.toBeNull();
  return trigger as HTMLElement;
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
      return ((key: string, values?: Record<string, string | number>) => {
        if (key === "commentRemaining") {
          return `remaining-${values?.count}`;
        }

        return key;
      }) as ReturnType<typeof useTranslations>;
    });
    sanitizeProfileTextMock.mockImplementation((value: string) => ({
      value,
    }));
    validateProfileTextMock.mockReturnValue({ valid: true });
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

    const trigger = getSelectionTrigger();

    expect(trigger).toHaveAttribute("tabindex", "0");
  });

  test("クリックで返信画面を開く", () => {
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

    fireEvent.click(getSelectionTrigger());

    expect(onCommentSelected).toHaveBeenCalledTimes(1);
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

    fireEvent.keyDown(getSelectionTrigger(), { key: "Enter" });

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

    fireEvent.keyDown(getSelectionTrigger(), { key: " " });

    expect(onCommentSelected).toHaveBeenCalledTimes(1);
  });

  test("Enter と Space 以外のキーでは返信画面を開かない", () => {
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

    fireEvent.keyDown(getSelectionTrigger(), { key: "Escape" });

    expect(onCommentSelected).not.toHaveBeenCalled();
  });

  test("デスクトップ幅ではコメント選択で返信画面を開かない", () => {
    const onCommentSelected = jest.fn();

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1024,
      writable: true,
    });

    render(
      <EditableComment
        comment={createComment()}
        currentUserId="viewer-1"
        onCommentUpdated={() => undefined}
        onCommentDeleted={() => undefined}
        onCommentSelected={onCommentSelected}
      />,
    );

    fireEvent.click(getSelectionTrigger());

    expect(onCommentSelected).not.toHaveBeenCalled();
  });

  test("コメント領域内のインタラクティブ要素クリックでは返信画面を開かない", () => {
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

    const nestedButton = document.createElement("button");
    getSelectionTrigger().appendChild(nestedButton);

    fireEvent.click(nestedButton);

    expect(onCommentSelected).not.toHaveBeenCalled();
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

    expect(screen.queryByText("comment body")?.closest("[role='button']")).toBeNull();
  });

  test("編集開始とキャンセルで入力内容を元に戻す", () => {
    render(
      <EditableComment
        comment={createComment()}
        currentUserId="user-1"
        onCommentUpdated={() => undefined}
        onCommentDeleted={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "edit" }));

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "updated body" } });
    fireEvent.click(screen.getAllByRole("button")[0]);

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText("comment body")).toBeInTheDocument();
  });

  test("編集保存成功時に API を呼んで更新通知する", async () => {
    const onCommentUpdated = jest.fn();
    updateCommentAPIMock.mockResolvedValue(undefined);

    render(
      <EditableComment
        comment={createComment()}
        currentUserId="user-1"
        onCommentUpdated={onCommentUpdated}
        onCommentDeleted={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "edit" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "updated body" },
    });
    fireEvent.click(screen.getAllByRole("button")[1]);

    await waitFor(() => {
      expect(updateCommentAPIMock).toHaveBeenCalledWith(
        "comment-1",
        "updated body",
        {
          commentUpdateFailed: "commentUpdateFailed",
        },
      );
      expect(onCommentUpdated).toHaveBeenCalledTimes(1);
    });
  });

  test("編集保存のバリデーションエラー時は toast を表示する", () => {
    validateProfileTextMock.mockReturnValue({
      valid: false,
      error: "validation failed",
    });

    render(
      <EditableComment
        comment={createComment()}
        currentUserId="user-1"
        onCommentUpdated={() => undefined}
        onCommentDeleted={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "edit" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "updated body" },
    });
    fireEvent.click(screen.getAllByRole("button")[1]);

    expect(updateCommentAPIMock).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith({
      title: "errorTitle",
      description: "validation failed",
      variant: "destructive",
    });
  });

  test("編集保存のバリデーションエラーで詳細がない場合は既定文言を表示する", () => {
    validateProfileTextMock.mockReturnValue({
      valid: false,
    });

    render(
      <EditableComment
        comment={createComment()}
        currentUserId="user-1"
        onCommentUpdated={() => undefined}
        onCommentDeleted={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "edit" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "updated body" },
    });
    fireEvent.click(screen.getAllByRole("button")[1]);

    expect(toastMock).toHaveBeenCalledWith({
      title: "errorTitle",
      description: "commentCreateFailed",
      variant: "destructive",
    });
  });

  test("編集保存 API 失敗時は toast を表示する", async () => {
    updateCommentAPIMock.mockRejectedValue(new Error("update failed"));

    render(
      <EditableComment
        comment={createComment()}
        currentUserId="user-1"
        onCommentUpdated={() => undefined}
        onCommentDeleted={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "edit" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "updated body" },
    });
    fireEvent.click(screen.getAllByRole("button")[1]);

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        title: "errorTitle",
        description: "update failed",
        variant: "destructive",
      });
    });
  });

  test("編集保存 API が Error 以外で失敗した場合は既定文言を表示する", async () => {
    updateCommentAPIMock.mockRejectedValue("unexpected");

    render(
      <EditableComment
        comment={createComment()}
        currentUserId="user-1"
        onCommentUpdated={() => undefined}
        onCommentDeleted={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "edit" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "updated body" },
    });
    fireEvent.click(screen.getAllByRole("button")[1]);

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        title: "errorTitle",
        description: "commentUpdateFailed",
        variant: "destructive",
      });
    });
  });

  test("削除成功時に API を呼んで削除通知する", async () => {
    const onCommentDeleted = jest.fn();
    deleteCommentAPIMock.mockResolvedValue(undefined);

    render(
      <EditableComment
        comment={createComment()}
        currentUserId="user-1"
        onCommentUpdated={() => undefined}
        onCommentDeleted={onCommentDeleted}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "delete" }));
    const deleteButtons = screen.getAllByRole("button", { name: "delete" });
    fireEvent.click(deleteButtons[deleteButtons.length - 1]);

    await waitFor(() => {
      expect(deleteCommentAPIMock).toHaveBeenCalledWith("comment-1", {
        commentDeleteFailed: "commentDeleteFailed",
      });
      expect(onCommentDeleted).toHaveBeenCalledTimes(1);
    });
  });

  test("削除 API 失敗時は toast を表示する", async () => {
    deleteCommentAPIMock.mockRejectedValue(new Error("delete failed"));

    render(
      <EditableComment
        comment={createComment()}
        currentUserId="user-1"
        onCommentUpdated={() => undefined}
        onCommentDeleted={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "delete" }));
    const deleteButtons = screen.getAllByRole("button", { name: "delete" });
    fireEvent.click(deleteButtons[deleteButtons.length - 1]);

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        title: "errorTitle",
        description: "delete failed",
        variant: "destructive",
      });
    });
  });

  test("削除 API が Error 以外で失敗した場合は既定文言を表示する", async () => {
    deleteCommentAPIMock.mockRejectedValue("unexpected");

    render(
      <EditableComment
        comment={createComment()}
        currentUserId="user-1"
        onCommentUpdated={() => undefined}
        onCommentDeleted={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "delete" }));
    const deleteButtons = screen.getAllByRole("button", { name: "delete" });
    fireEvent.click(deleteButtons[deleteButtons.length - 1]);

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        title: "errorTitle",
        description: "commentDeleteFailed",
        variant: "destructive",
      });
    });
  });

  test("英語ロケールでは匿名名のアバター付きコメントを表示する", () => {
    useLocaleMock.mockReturnValue("en");

    render(
      <EditableComment
        comment={createComment({
          user_id: null,
          user_nickname: "",
          user_avatar_url: "https://cdn.example/avatar.png",
        })}
        currentUserId="viewer-1"
        onCommentUpdated={() => undefined}
        onCommentDeleted={() => undefined}
      />,
    );

    expect(screen.getByRole("img", { name: "anonymousUser" })).toHaveAttribute(
      "src",
      "https://cdn.example/avatar.png",
    );
  });

  test("残り文字数が 20 未満になると警告色で表示する", () => {
    render(
      <EditableComment
        comment={createComment()}
        currentUserId="user-1"
        onCommentUpdated={() => undefined}
        onCommentDeleted={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "edit" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "x".repeat(181) },
    });

    expect(screen.getByText("remaining-19")).toHaveClass("text-red-500");
  });
});
