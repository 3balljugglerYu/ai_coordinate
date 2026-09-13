import { fireEvent, render, screen } from "@testing-library/react";
import { useTranslations } from "next-intl";

import { PostComposerPage } from "@/features/posts/components/PostComposerPage";

/**
 * 投稿フォームの専用ページ側のつなぎ。
 *
 * 投稿してもやめても元の画面へ戻す。戻り先の一覧はサーバーで取得した
 * `is_posted` を使うので、`refresh` を呼ばないと投稿済みのカードに
 * 「投稿」ボタンが残る。
 *
 * `generationType` の受け渡しは、以前 GeneratedImageGallery などクライアント
 * 側から流していたものをページが DB から引くようにした分の保証を引き継ぐ。
 * これが途切れると「プロンプトを公開する」トグルが出なくなる。
 */
const push = jest.fn();
const back = jest.fn();
const refresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push, back, refresh }),
}));

jest.mock("next-intl", () => ({ useTranslations: jest.fn() }));

jest.mock("next/image", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("@/features/notifications/components/UnreadNotificationProvider", () => ({
  useUnreadNotificationCount: () => ({ refreshUnreadCount: jest.fn() }),
}));

jest.mock("@/features/posts/lib/api", () => ({
  postImageAPI: jest.fn(),
  fetchBeforeSourceUrl: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/features/posts/components/HashtagSuggestionChips", () => ({
  HashtagSuggestionChips: () => null,
}));

jest.mock("@/features/posts/components/SearchAvailabilityProvider", () => ({
  useSearchAvailable: () => false,
}));

const translations: Record<string, string> = {
  postModalTitle: "画像を投稿",
  captionLabel: "キャプション",
  cancel: "キャンセル",
  postSubmit: "投稿する",
  postSubmitting: "投稿中...",
  promptVisibilityLabel: "プロンプトの公開設定",
  promptVisibilityPublicOption: "プロンプトを公開する",
  promptVisibilityPrivateOption: "プロンプトを非公開にする",
};

beforeEach(() => {
  jest.clearAllMocks();
  (useTranslations as jest.Mock).mockReturnValue(
    (key: string, values?: Record<string, unknown>) =>
      translations[key] ?? `${key}${values ? JSON.stringify(values) : ""}`,
  );
});

describe("PostComposerPage", () => {
  it("やめると元の画面へ戻り、戻り先を取り直す", () => {
    render(<PostComposerPage imageId="image-1" />);

    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(back).toHaveBeenCalled();
    // これが無いと戻り先の一覧が古いままで「投稿」ボタンが残る
    expect(refresh).toHaveBeenCalled();
  });

  it("じゆうモードの root 投稿ではプロンプトの公開設定を出す", () => {
    render(
      <PostComposerPage
        imageId="image-1"
        generationType="free"
        sourcePostId={null}
      />,
    );

    expect(screen.getByText("プロンプトの公開設定")).toBeInTheDocument();
  });

  it("generationType が無ければプロンプトの公開設定を出さない", () => {
    render(<PostComposerPage imageId="image-1" />);

    expect(screen.queryByText("プロンプトの公開設定")).not.toBeInTheDocument();
  });
});
