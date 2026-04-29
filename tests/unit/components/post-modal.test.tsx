import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useTranslations } from "next-intl";
import { PostModal } from "@/features/posts/components/PostModal";
import { postImageAPI } from "@/features/posts/lib/api";
import { useUnreadNotificationCount } from "@/features/notifications/components/UnreadNotificationProvider";
import { persistPendingHomePostRefresh } from "@/features/posts/lib/home-post-refresh";

jest.mock("next-intl", () => ({
  useTranslations: jest.fn(),
}));

jest.mock("@/features/posts/lib/api", () => ({
  postImageAPI: jest.fn(),
}));

jest.mock("@/features/notifications/components/UnreadNotificationProvider", () => ({
  useUnreadNotificationCount: jest.fn(),
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
const postImageAPIMock = postImageAPI as jest.MockedFunction<typeof postImageAPI>;
const useUnreadNotificationCountMock =
  useUnreadNotificationCount as jest.MockedFunction<
    typeof useUnreadNotificationCount
  >;
const persistPendingHomePostRefreshMock =
  persistPendingHomePostRefresh as jest.MockedFunction<
    typeof persistPendingHomePostRefresh
  >;

const postTranslations = {
  captionTooLong: ({ max }: { max: number }) => `キャプションは${max}文字以内で入力してください`,
  postFailed: "投稿に失敗しました",
  postFailedRetry: "投稿に失敗しました。もう一度お試しください。",
  postModalTitle: "画像を投稿",
  postModalDescription: ({ max }: { max: number }) =>
    `キャプションを入力して投稿します（任意、最大${max}文字）`,
  captionLabel: "キャプション",
  captionPlaceholder: "画像の説明を入力してください（任意）",
  charactersRemaining: ({ count }: { count: number }) => `${count}文字残り`,
  cancel: "キャンセル",
  postSubmitting: "投稿中...",
  postSubmit: "投稿する",
} as const;

const postsTranslator = ((key: keyof typeof postTranslations, values?: Record<string, unknown>) => {
  const entry = postTranslations[key];
  return typeof entry === "function" ? entry(values as never) : entry;
}) as unknown as ReturnType<typeof useTranslations>;

describe("PostModal", () => {
  const originalLocation = window.location;
  let fetchMock: jest.Mock;
  let refreshUnreadCountMock: jest.Mock;

  beforeAll(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { href: "" },
    });
  });

  afterAll(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock = jest.fn().mockResolvedValue({ ok: true });
    refreshUnreadCountMock = jest.fn().mockResolvedValue(undefined);

    global.fetch = fetchMock as unknown as typeof fetch;
    window.location.href = "";

    useTranslationsMock.mockImplementation((namespace?: string) => {
      if (namespace === "posts") {
        return postsTranslator;
      }
      throw new Error(`Unexpected namespace: ${namespace}`);
    });
    postImageAPIMock.mockResolvedValue({
      id: "post-1",
      is_posted: true,
      caption: "fresh caption",
      posted_at: "2026-03-16T00:00:00.000Z",
      bonus_granted: 50,
    });
    useUnreadNotificationCountMock.mockReturnValue({
      unreadCount: 0,
      hasAnnouncementPageDot: false,
      hasAnnouncementTabDot: false,
      hasSidebarDot: false,
      refreshUnreadCount: refreshUnreadCountMock,
      refreshAnnouncementDots: jest.fn(),
      markAnnouncementPageSeen: jest.fn(),
      markAnnouncementTabSeen: jest.fn(),
    });
  });

  test("投稿成功時_postedペイロードを保存してホーム再検証後に遷移する", async () => {
    const onOpenChange = jest.fn();

    render(
      <PostModal
        open
        onOpenChange={onOpenChange}
        imageId="image-1"
        currentCaption="before"
      />
    );

    fireEvent.change(screen.getByLabelText("キャプション"), {
      target: { value: "after" },
    });
    fireEvent.click(screen.getByRole("button", { name: "投稿する" }));

    await waitFor(() => {
      expect(postImageAPIMock).toHaveBeenCalledWith(
        {
          id: "image-1",
          caption: "after",
        },
        {
          postFailed: "投稿に失敗しました",
        }
      );
    });

    expect(persistPendingHomePostRefreshMock).toHaveBeenCalledWith({
      action: "posted",
      postId: "post-1",
      bonusGranted: 50,
    });
    expect(refreshUnreadCountMock).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith("/api/revalidate/home", {
      method: "POST",
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(window.location.href).toBe("/");
  });

  test("投稿成功ハンドラが既定遷移を抑止した場合_ホームへ遷移しない", async () => {
    const onOpenChange = jest.fn();
    const onPostSuccess = jest
      .fn()
      .mockResolvedValue({ skipDefaultRedirect: true });

    render(
      <PostModal
        open
        onOpenChange={onOpenChange}
        imageId="image-1"
        onPostSuccess={onPostSuccess}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "投稿する" }));

    await waitFor(() => {
      expect(onPostSuccess).toHaveBeenCalledWith({
        id: "post-1",
        is_posted: true,
        caption: "fresh caption",
        posted_at: "2026-03-16T00:00:00.000Z",
        bonus_granted: 50,
      });
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/revalidate/home", { method: "POST" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(window.location.href).toBe("");
  });
});
