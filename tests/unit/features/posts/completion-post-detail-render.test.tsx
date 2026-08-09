/** @jest-environment jsdom */

/**
 * 完走フィード投稿の詳細ページ描画テスト(PR: 完走投稿を通常詳細で開く)。
 *
 * - 詳細に汎用CTA(book=めくって見る / mount=カードを見る)が出て /m へ遷移する
 * - コンプリートバッジが出る
 * - 生成モード行(PostMetaLine)は完走投稿では出さない
 * - 通常投稿には CTA が出ず、PostMetaLine は従来どおり出る
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { useTranslations } from "next-intl";
import { PostDetailStatic } from "@/features/posts/components/PostDetailStatic";
import type { Post } from "@/features/posts/types";

jest.mock("next-intl", () => ({
  useLocale: () => "ja",
  useTranslations: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ alt, src }: { alt?: string; src?: string }) =>
    React.createElement("img", { alt, src }),
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) =>
    React.createElement("a", { href }, children),
}));

jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

jest.mock("@/features/posts/lib/utils", () => ({
  getPostImageUrl: () => "https://cdn.example/post.png",
  getPostBeforeImageUrl: () => null,
}));

jest.mock("@/features/posts/components/PostDetailStatsContent", () => ({
  PostDetailStatsContent: () => <div data-testid="stats" />,
}));

jest.mock("@/features/posts/components/PostDetailStatsSkeleton", () => ({
  PostDetailStatsSkeleton: () => null,
}));

// 「完走投稿では出さない」を検査するため、マーカーを描画するモックにする
jest.mock("@/features/posts/components/PostMetaLine", () => ({
  PostMetaLine: () => <div data-testid="post-meta-line" />,
}));

jest.mock("@/features/posts/components/CollapsibleText", () => ({
  CollapsibleText: ({ text }: { text: string }) => <div>{text}</div>,
}));

jest.mock("@/features/posts/components/ImageFullscreen", () => ({
  ImageFullscreen: () => null,
}));

jest.mock("@/features/posts/components/EditPostModal", () => ({
  EditPostModal: () => null,
}));

jest.mock("@/features/posts/components/DeletePostDialog", () => ({
  DeletePostDialog: () => null,
}));

jest.mock("@/features/posts/components/PostModal", () => ({
  PostModal: () => null,
}));

jest.mock("@/features/moderation/components/PostModerationMenu", () => ({
  PostModerationMenu: () => null,
}));

// 完走投稿で誤って描画されると null プリセットでクラッシュする実障害があったため、
// マーカーを描画するモックにして「出ていないこと」を検査できるようにする
jest.mock("@/features/style/components/OneTapStyleDetailCard", () => ({
  OneTapStyleDetailCard: () => <div data-testid="one-tap-card" />,
}));

jest.mock("@/features/subscription/components/SubscriptionBadge", () => ({
  SubscriptionBadge: () => null,
}));

jest.mock(
  "@/features/generation/components/PromptLockedGenerationSheet",
  () => ({
    PromptLockedGenerationSheet: () => null,
  })
);

jest.mock("@/features/users/components/FollowButton", () => ({
  FollowButton: () => null,
}));

const useTranslationsMock = useTranslations as jest.MockedFunction<
  typeof useTranslations
>;

/** 文言はキーをそのまま返す。どのキーが描画されたかで判定する。 */
const passthroughTranslator = ((key: string) =>
  key) as unknown as ReturnType<typeof useTranslations>;

const AUTHOR_ID = "author-1";
const COMPLETION_ID = "cmp-1";

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: "img-1",
    user_id: AUTHOR_ID,
    image_url: "https://cdn.example/post.png",
    storage_path: "path",
    prompt: "",
    is_posted: true,
    caption: null,
    generation_type: "one_tap_style",
    user: {
      id: AUTHOR_ID,
      nickname: "作者",
      avatar_url: null,
      subscription_plan: "free",
    },
    ...overrides,
  } as Post;
}

function renderDetail(post: Post) {
  return render(
    <PostDetailStatic
      post={post}
      currentUserId="viewer-1"
      imageAspectRatio={null}
      postId={post.id ?? ""}
      initialLikeCount={0}
      initialCommentCount={0}
      initialViewCount={0}
      ownerId={post.user_id}
      imageUrl="https://cdn.example/post.png"
    />
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useTranslationsMock.mockReturnValue(passthroughTranslator);
});

describe("完走投稿の詳細描画", () => {
  it("book 型: めくって見るCTAが /m/<id>/book へリンクし、バッジ表示・メタ行なし", () => {
    renderDetail(
      makePost({ completion_id: COMPLETION_ID, completion_view_mode: "book" })
    );
    const cta = screen.getByText("completionViewBook");
    expect(cta.closest("a")).toHaveAttribute("href", `/m/${COMPLETION_ID}/book`);
    expect(screen.getByText("completionBadge")).toBeInTheDocument();
    expect(screen.queryByTestId("post-meta-line")).toBeNull();
    // generation_type=one_tap_style でもプリセットカードは出ない(null クラッシュ再発防止)
    expect(screen.queryByTestId("one-tap-card")).toBeNull();
    expect(screen.queryByText("completionViewMount")).toBeNull();
  });

  it("mount 型: カードを見るCTAが /m/<id> へリンクする", () => {
    renderDetail(
      makePost({ completion_id: COMPLETION_ID, completion_view_mode: "mount" })
    );
    const cta = screen.getByText("completionViewMount");
    expect(cta.closest("a")).toHaveAttribute("href", `/m/${COMPLETION_ID}`);
    expect(screen.queryByText("completionViewBook")).toBeNull();
  });

  it("通常投稿: CTA・バッジは出ず、生成モード行は従来どおり出る", () => {
    renderDetail(makePost({ generation_type: "free" }));
    expect(screen.queryByText("completionViewBook")).toBeNull();
    expect(screen.queryByText("completionViewMount")).toBeNull();
    expect(screen.queryByText("completionBadge")).toBeNull();
    expect(screen.getByTestId("post-meta-line")).toBeInTheDocument();
  });
});
