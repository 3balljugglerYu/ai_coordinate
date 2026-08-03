import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useTranslations } from "next-intl";
import { PostModal } from "@/features/posts/components/PostModal";
import {
  fetchBeforeSourceUrl,
  postImageAPI,
} from "@/features/posts/lib/api";
import { beforeImageUrlCache } from "@/features/posts/lib/before-image-cache";
import { useUnreadNotificationCount } from "@/features/notifications/components/UnreadNotificationProvider";
import {
  notifyPendingHomePostRefresh,
  persistPendingHomePostRefresh,
} from "@/features/posts/lib/home-post-refresh";

jest.mock("next-intl", () => ({
  useTranslations: jest.fn(),
}));

jest.mock("@/features/posts/lib/api", () => ({
  postImageAPI: jest.fn(),
  fetchBeforeSourceUrl: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/features/notifications/components/UnreadNotificationProvider", () => ({
  useUnreadNotificationCount: jest.fn(),
}));

jest.mock("@/features/posts/lib/home-post-refresh", () => ({
  notifyPendingHomePostRefresh: jest.fn(),
  persistPendingHomePostRefresh: jest.fn(),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({
    alt,
    src,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement>) =>
    React.createElement("img", { alt, src, ...props }),
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
const fetchBeforeSourceUrlMock = fetchBeforeSourceUrl as jest.MockedFunction<
  typeof fetchBeforeSourceUrl
>;
const useUnreadNotificationCountMock =
  useUnreadNotificationCount as jest.MockedFunction<
    typeof useUnreadNotificationCount
  >;
const persistPendingHomePostRefreshMock =
  persistPendingHomePostRefresh as jest.MockedFunction<
    typeof persistPendingHomePostRefresh
  >;
const notifyPendingHomePostRefreshMock =
  notifyPendingHomePostRefresh as jest.MockedFunction<
    typeof notifyPendingHomePostRefresh
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
  afterImageAlt: "生成後画像",
  beforeImageAlt: "生成前画像",
  afterImageLabel: "After",
  beforeImageLabel: "Before",
  showBeforeImageLabel: "生成前画像も表示する",
  promptVisibilityLabel: "プロンプトの公開設定",
  promptVisibilityPublicOption: "プロンプトを公開する",
  promptVisibilityPrivateOption: "プロンプトを非公開にする",
  promptVisibilityPublicHint:
    "フォロワーはプロンプトをコピーできます。コピーから作られた分は利用数に入りません。",
  promptVisibilityPrivateHint:
    "プロンプトは誰にも見せません。フォロワーは中身を見ずに、同じプロンプトで生成だけできます。",
  showBeforeImageHint:
    "元画像も表示することで、どんな変化が起きるか伝わりやすくなります。",
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
    // Before 画像 URL の module-level cache をテスト間でクリア
    beforeImageUrlCache.clear();
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
    fetchBeforeSourceUrlMock.mockResolvedValue(null);
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
    fireEvent.submit(screen.getByLabelText("キャプション").closest("form")!);

    await waitFor(() => {
      expect(postImageAPIMock).toHaveBeenCalledWith(
        {
          id: "image-1",
          caption: "after",
          show_before_image: true,
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
    expect(notifyPendingHomePostRefreshMock).toHaveBeenCalledTimes(1);
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

    fireEvent.submit(screen.getByLabelText("キャプション").closest("form")!);

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
    expect(notifyPendingHomePostRefreshMock).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(window.location.href).toBe("");
  });

  test("Before画像を自動取得してプレビューし_OFFで投稿するとshow_before_image=falseを送る", async () => {
    fetchBeforeSourceUrlMock.mockResolvedValue(
      "https://cdn.example/before.webp"
    );

    render(
      <PostModal
        open
        onOpenChange={jest.fn()}
        imageId="image-1"
        afterImageUrl="https://cdn.example/after.webp"
      />
    );

    await waitFor(() => {
      expect(fetchBeforeSourceUrlMock).toHaveBeenCalledWith("image-1");
    });
    expect(await screen.findByAltText("生成前画像")).toHaveAttribute(
      "src",
      "https://cdn.example/before.webp"
    );

    fireEvent.click(
      screen.getByRole("checkbox", { name: "生成前画像も表示する" })
    );
    await waitFor(() => {
      expect(screen.queryByAltText("生成前画像")).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "投稿する" }));

    await waitFor(() => {
      expect(postImageAPIMock).toHaveBeenCalledWith(
        {
          id: "image-1",
          caption: undefined,
          show_before_image: false,
        },
        {
          postFailed: "投稿に失敗しました",
        }
      );
    });
  });

  test("beforeImageUrlが渡された場合は自動取得せず親URLを表示する", async () => {
    render(
      <PostModal
        open
        onOpenChange={jest.fn()}
        imageId="image-1"
        afterImageUrl="https://cdn.example/after.webp"
        beforeImageUrl="https://cdn.example/parent-before.webp"
      />
    );

    expect(fetchBeforeSourceUrlMock).not.toHaveBeenCalled();
    expect(screen.getByAltText("生成前画像")).toHaveAttribute(
      "src",
      "https://cdn.example/parent-before.webp"
    );
  });

  test("閉じている場合とimageIdが空の場合はBefore画像を自動取得しない", () => {
    const { rerender } = render(
      <PostModal open={false} onOpenChange={jest.fn()} imageId="image-1" />
    );

    expect(fetchBeforeSourceUrlMock).not.toHaveBeenCalled();

    rerender(<PostModal open onOpenChange={jest.fn()} imageId="" />);

    expect(fetchBeforeSourceUrlMock).not.toHaveBeenCalled();
  });

  test("投稿APIが失敗した場合はエラーを表示する", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    postImageAPIMock.mockRejectedValue(new Error("network down"));

    render(
      <PostModal open onOpenChange={jest.fn()} imageId="image-1" />
    );

    fireEvent.click(screen.getByRole("button", { name: "投稿する" }));

    expect(await screen.findByText("network down")).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  test("キャプションが上限を超える場合は送信せずエラーを表示する", async () => {
    render(
      <PostModal
        open
        onOpenChange={jest.fn()}
        imageId="image-1"
        currentCaption={"あ".repeat(201)}
      />
    );

    fireEvent.submit(screen.getByLabelText("キャプション").closest("form")!);

    expect(
      await screen.findByText("キャプションは200文字以内で入力してください")
    ).toBeInTheDocument();
    expect(postImageAPIMock).not.toHaveBeenCalled();
  });

  test("通知バッジ更新に失敗しても投稿完了処理を続ける", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    refreshUnreadCountMock.mockRejectedValue(new Error("refresh failed"));
    const onOpenChange = jest.fn();

    render(
      <PostModal open onOpenChange={onOpenChange} imageId="image-1" />
    );

    fireEvent.click(screen.getByRole("button", { name: "投稿する" }));

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to refresh unread notification count:",
      expect.any(Error)
    );
    consoleError.mockRestore();
  });

  test("キャンセルボタンでモーダルを閉じる", () => {
    const onOpenChange = jest.fn();

    render(
      <PostModal open onOpenChange={onOpenChange} imageId="image-1" />
    );

    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
  describe("プロンプトの公開設定", () => {
    test("じゆうモードの root 投稿では選べる", () => {
      render(
        <PostModal
          open
          onOpenChange={jest.fn()}
          imageId="image-1"
          generationType="free"
        />
      );

      expect(
        screen.getByLabelText("プロンプトを非公開にする")
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText("プロンプトを公開する")
      ).toBeInTheDocument();
    });

    test("既定は非公開で prompt_visibility=private を送る", async () => {
      // 非公開なら使うたびに投稿者へ人が戻る。既定は最も強い誘導なので
      // 投稿者に返るほうへ倒す（ADR-004 改訂）。
      render(
        <PostModal
          open
          onOpenChange={jest.fn()}
          imageId="image-1"
          generationType="free"
        />
      );

      expect(screen.getByLabelText("プロンプトを非公開にする")).toBeChecked();

      fireEvent.submit(screen.getByLabelText("キャプション").closest("form")!);

      await waitFor(() => {
        expect(postImageAPIMock).toHaveBeenCalledWith(
          expect.objectContaining({ prompt_visibility: "private" }),
          expect.anything()
        );
      });
    });

    test("公開を選ぶと prompt_visibility=public を送り説明が入れ替わる", async () => {
      render(
        <PostModal
          open
          onOpenChange={jest.fn()}
          imageId="image-1"
          generationType="free"
        />
      );

      // 選んだ側の説明だけを出す（両方並べるとモバイルで圧迫する）
      expect(
        screen.getByText(
          "プロンプトは誰にも見せません。フォロワーは中身を見ずに、同じプロンプトで生成だけできます。"
        )
      ).toBeInTheDocument();

      fireEvent.click(screen.getByLabelText("プロンプトを公開する"));

      expect(
        screen.getByText(
          "フォロワーはプロンプトをコピーできます。コピーから作られた分は利用数に入りません。"
        )
      ).toBeInTheDocument();
      expect(
        screen.queryByText(
          "プロンプトは誰にも見せません。フォロワーは中身を見ずに、同じプロンプトで生成だけできます。"
        )
      ).not.toBeInTheDocument();

      fireEvent.submit(screen.getByLabelText("キャプション").closest("form")!);

      await waitFor(() => {
        expect(postImageAPIMock).toHaveBeenCalledWith(
          expect.objectContaining({ prompt_visibility: "public" }),
          expect.anything()
        );
      });
    });

    test("coordinate では出さず prompt_visibility も送らない", async () => {
      render(
        <PostModal
          open
          onOpenChange={jest.fn()}
          imageId="image-1"
          generationType="coordinate"
        />
      );

      expect(
        screen.queryByLabelText("プロンプトを非公開にする")
      ).not.toBeInTheDocument();

      fireEvent.submit(screen.getByLabelText("キャプション").closest("form")!);

      await waitFor(() => {
        expect(postImageAPIMock).toHaveBeenCalled();
      });
      const payload = postImageAPIMock.mock.calls[0][0];
      expect("prompt_visibility" in payload).toBe(false);
    });

    test("派生投稿では出さない", () => {
      render(
        <PostModal
          open
          onOpenChange={jest.fn()}
          imageId="image-1"
          generationType="free"
          sourcePostId="22222222-2222-4222-8222-222222222222"
        />
      );

      expect(
        screen.queryByLabelText("プロンプトを非公開にする")
      ).not.toBeInTheDocument();
    });

    test("種別が渡されていない画面では出さない", () => {
      render(<PostModal open onOpenChange={jest.fn()} imageId="image-1" />);

      expect(
        screen.queryByLabelText("プロンプトを非公開にする")
      ).not.toBeInTheDocument();
    });
  });

  describe("元画像の説明", () => {
    test("チェックの有無によらず常に出す", () => {
      // 外した瞬間に説明が現れるのは実質の引き止めになる。
      // 元画像を出さない判断には見せたくない理由があることが多い。
      render(<PostModal open onOpenChange={jest.fn()} imageId="image-1" />);

      const hint =
        "元画像も表示することで、どんな変化が起きるか伝わりやすくなります。";
      expect(screen.getByText(hint)).toBeInTheDocument();

      fireEvent.click(screen.getByLabelText("生成前画像も表示する"));

      expect(screen.getByText(hint)).toBeInTheDocument();
    });
  });
});
