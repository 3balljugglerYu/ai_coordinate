import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { DeletePostDialog } from "@/features/posts/components/DeletePostDialog";
import { deletePost } from "@/features/posts/lib/api";
import { deleteMyImage } from "@/features/my-page/lib/api";
import { persistPendingHomePostRefresh } from "@/features/posts/lib/home-post-refresh";

jest.mock("next-intl", () => ({
  useTranslations: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}));

jest.mock("@/features/posts/lib/api", () => ({
  deletePost: jest.fn(),
}));

jest.mock("@/features/my-page/lib/api", () => ({
  deleteMyImage: jest.fn(),
}));

jest.mock("@/features/posts/lib/home-post-refresh", () => ({
  persistPendingHomePostRefresh: jest.fn(),
}));

jest.mock("@/components/ui/dialog", () => ({
  Dialog: ({
    children,
    open,
  }: {
    children: React.ReactNode;
    open: boolean;
  }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const useTranslationsMock = useTranslations as jest.MockedFunction<
  typeof useTranslations
>;
const useRouterMock = useRouter as jest.MockedFunction<typeof useRouter>;
const useSearchParamsMock = useSearchParams as jest.MockedFunction<
  typeof useSearchParams
>;
const deletePostMock = deletePost as jest.MockedFunction<typeof deletePost>;
const deleteMyImageMock = deleteMyImage as jest.MockedFunction<typeof deleteMyImage>;
const persistPendingHomePostRefreshMock =
  persistPendingHomePostRefresh as jest.MockedFunction<
    typeof persistPendingHomePostRefresh
  >;

const postTranslations = {
  deleteFailed: "削除に失敗しました",
  deleteFailedRetry: "削除に失敗しました。もう一度お試しください。",
  deleteDialogUnpostTitle: "投稿を取り消す",
  deleteDialogDeleteTitle: "画像を削除",
  deleteDialogUnpostDescription: "この投稿を投稿一覧から取り消しますか？",
  deleteDialogDeleteDescription: "この画像を完全に削除しますか？",
  deleteDialogImageAlt: "削除対象の画像",
  cancel: "キャンセル",
  deleteDialogUnposting: "取り消し中...",
  deleteDialogDeleting: "削除中...",
  unpost: "投稿を取り消す",
  delete: "削除",
} as const;

const myPageTranslations = {
  loginRequired: "ログインが必要です",
  imageNotFound: "画像が見つかりません",
  deleteImageForbidden: "削除権限がありません",
  deleteImageFailed: "画像の削除に失敗しました",
} as const;

const postTranslator = ((key: keyof typeof postTranslations) => {
  return postTranslations[key];
}) as unknown as ReturnType<typeof useTranslations>;

const myPageTranslator = ((key: keyof typeof myPageTranslations) => {
  return myPageTranslations[key];
}) as unknown as ReturnType<typeof useTranslations>;

describe("DeletePostDialog", () => {
  const originalLocation = window.location;
  let fetchMock: jest.Mock;
  let pushMock: jest.Mock;
  let refreshMock: jest.Mock;
  let fromParam: string | null;

  beforeAll(() => {
    delete (window as Window & typeof globalThis & { location?: Location }).location;
    (window as Window & typeof globalThis & { location: Location }).location = {
      href: "",
    } as unknown as Location;
  });

  afterAll(() => {
    (window as Window & typeof globalThis & { location: Location }).location =
      originalLocation;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock = jest.fn().mockResolvedValue({ ok: true });
    pushMock = jest.fn();
    refreshMock = jest.fn();
    fromParam = null;

    global.fetch = fetchMock as unknown as typeof fetch;
    window.location.href = "";

    useTranslationsMock.mockImplementation((namespace?: string) => {
      if (namespace === "posts") {
        return postTranslator;
      }
      if (namespace === "myPage") {
        return myPageTranslator;
      }
      throw new Error(`Unexpected namespace: ${namespace}`);
    });
    useRouterMock.mockReturnValue({
      push: pushMock,
      refresh: refreshMock,
    } as unknown as ReturnType<typeof useRouter>);
    useSearchParamsMock.mockImplementation(
      () =>
        ({
          get: (key: string) => (key === "from" ? fromParam : null),
        }) as unknown as ReturnType<typeof useSearchParams>
    );
    deletePostMock.mockResolvedValue(undefined);
    deleteMyImageMock.mockResolvedValue(undefined);
  });

  test("投稿取り消しでホームへ戻る場合_unpostedペイロードを保存して再検証後に遷移する", async () => {
    render(
      <DeletePostDialog
        open
        onOpenChange={jest.fn()}
        imageId="post-1"
        isPosted
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "投稿を取り消す" }));

    await waitFor(() => {
      expect(deletePostMock).toHaveBeenCalledWith("post-1", {
        deleteFailed: "削除に失敗しました",
      });
    });

    expect(persistPendingHomePostRefreshMock).toHaveBeenCalledWith({
      action: "unposted",
      postId: "post-1",
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/revalidate/home", { method: "POST" });
    expect(window.location.href).toBe("/");
  });

  test("マイページへ戻る場合_一時ペイロードを保存せずrouterで戻る", async () => {
    fromParam = "my-page";

    render(
      <DeletePostDialog
        open
        onOpenChange={jest.fn()}
        imageId="post-2"
        isPosted
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "投稿を取り消す" }));

    await waitFor(() => {
      expect(deletePostMock).toHaveBeenCalled();
    });

    expect(persistPendingHomePostRefreshMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalledWith("/my-page");
    expect(refreshMock).toHaveBeenCalled();
  });
});
