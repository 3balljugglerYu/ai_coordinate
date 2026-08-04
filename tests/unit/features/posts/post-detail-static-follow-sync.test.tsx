/**
 * PostDetailStatic のフォロー同期とプロンプト表示ゲートのテスト。
 *
 * PostDetail と同一ロジックの双子ファイルだが、本番で使われるのはこちら
 * （CachedPostDetail → PostDetailContent → PostDetailStatic）。PostDetail 側の
 * テストだけではこのファイルの回帰を検出できないため、直接レンダリングして固定する。
 *
 * 対象は PR #472 の2点。
 * - 上部（ユーザーアイコン横）のフォローで、再読込なしにカードが有効になる
 * - root の投稿ではフォロー導線がヘッダーの1つだけになる
 */

import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useTranslations } from "next-intl";
import { PostDetailStatic } from "@/features/posts/components/PostDetailStatic";
import type { Post } from "@/features/posts/types";

jest.mock("next-intl", () => ({
  useTranslations: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  // next/image 固有の props (fill / priority など) は DOM に渡すと警告になるので落とす
  default: ({
    alt,
    src,
  }: {
    alt?: string;
    src?: string;
  }) => React.createElement("img", { alt, src }),
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

jest.mock("@/features/posts/components/PostMetaLine", () => ({
  PostMetaLine: () => null,
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

jest.mock("@/features/style/components/OneTapStyleDetailCard", () => ({
  OneTapStyleDetailCard: () => null,
}));

jest.mock("@/features/subscription/components/SubscriptionBadge", () => ({
  SubscriptionBadge: () => null,
}));

// 参照カードの生成シートは vaul と生成フォーム一式を抱えるため差し替える
jest.mock(
  "@/features/generation/components/PromptLockedGenerationSheet",
  () => ({
    PromptLockedGenerationSheet: () => null,
  })
);

jest.mock("@/features/users/components/FollowButton", () => ({
  FollowButton: ({
    userId,
    onFollowChange,
  }: {
    userId: string;
    onFollowChange?: (isFollowing: boolean) => void;
  }) => (
    <button
      type="button"
      data-testid="follow-button"
      data-user-id={userId}
      onClick={() => onFollowChange?.(true)}
    />
  ),
}));

const useTranslationsMock = useTranslations as jest.MockedFunction<
  typeof useTranslations
>;

/** 文言はキーをそのまま返す。表示の有無だけを検査する。 */
const passthroughTranslator = ((key: string) =>
  key) as unknown as ReturnType<typeof useTranslations>;

const AUTHOR_ID = "author-1";
const VIEWER_ID = "viewer-1";

function createFreePrivatePost(): Post {
  return {
    id: "img-1",
    user_id: AUTHOR_ID,
    image_url: "https://cdn.example/post.png",
    storage_path: "path",
    prompt: "",
    is_posted: true,
    caption: null,
    generation_type: "free",
    prompt_visibility: "private",
    user: {
      id: AUTHOR_ID,
      nickname: "作者",
      avatar_url: null,
      subscription_plan: "free",
    },
    source_reference: {
      postId: "img-1",
      isAvailable: true,
      authorId: AUTHOR_ID,
      authorNickname: "作者",
      authorAvatarUrl: null,
      thumbnailUrl: null,
      thumbnailWidth: null,
      thumbnailHeight: null,
      beforeThumbnailUrl: null,
      promptVisibility: "private",
      usageCount: 0,
    },
  } as Post;
}

function renderStatic(post: Post, options?: { viewerIsAdmin?: boolean }) {
  return render(
    <PostDetailStatic
      post={post}
      currentUserId={VIEWER_ID}
      imageAspectRatio={null}
      postId={post.id ?? ""}
      initialLikeCount={0}
      initialCommentCount={0}
      initialViewCount={0}
      ownerId={post.user_id}
      imageUrl="https://cdn.example/post.png"
      viewerIsAdmin={options?.viewerIsAdmin}
    />
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useTranslationsMock.mockReturnValue(passthroughTranslator);
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ isFollowing: false }),
  }) as never;
});

describe("フォロー同期（本番で使われる側の双子ファイル）", () => {
  it("上部のボタンでフォローすると再読込なしでカードが有効になる", async () => {
    await act(async () => {
      renderStatic(createFreePrivatePost());
    });

    // 未フォロー: 生成ボタンは無い
    expect(
      screen.queryByRole("button", { name: /sourcePromptCardTitle/ })
    ).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId("follow-button"));
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /sourcePromptCardTitle/ })
      ).toBeInTheDocument();
    });
  });

it("派生投稿ではカードのボタンが原作者への唯一の導線で、押すと即有効になる", async () => {
    // ヘッダーのボタンは派生者向け、カードのボタンは原作者向けで別人。
    // カード側を隠してはいけないし、押したら再読込なしで反映される。
    const derived = {
      ...createFreePrivatePost(),
      user_id: "deriver-1",
      user: {
        id: "deriver-1",
        nickname: "派生者",
        avatar_url: null,
        subscription_plan: "free" as const,
      },
      source_post_id: "origin-post",
      source_reference: {
        postId: "origin-post",
        isAvailable: true,
        authorId: "origin-1",
        authorNickname: "原作者",
        authorAvatarUrl: null,
        thumbnailUrl: null,
        thumbnailWidth: null,
        thumbnailHeight: null,
        beforeThumbnailUrl: null,
        promptVisibility: "private" as const,
        usageCount: 0,
      },
    } as Post;

    await act(async () => {
      renderStatic(derived);
    });

    // ヘッダー（派生者向け）とカード（原作者向け）の2つが出る
    const buttons = screen.getAllByTestId("follow-button");
    expect(buttons.map((b) => b.getAttribute("data-user-id")).sort()).toEqual([
      "deriver-1",
      "origin-1",
    ]);

    const originButton = buttons.find(
      (b) => b.getAttribute("data-user-id") === "origin-1"
    )!;
    await act(async () => {
      fireEvent.click(originButton);
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /sourcePromptCardTitle/ })
      ).toBeInTheDocument();
    });
  });

  it("root の投稿ではフォロー導線がヘッダーの1つだけになる", async () => {
    // カード側は同じ相手（投稿者=原作者）なので隠れる
    await act(async () => {
      renderStatic(createFreePrivatePost());
    });

    expect(screen.getAllByTestId("follow-button")).toHaveLength(1);
  });
});

describe("運営のプロンプト表示（REQ-018）", () => {
  it("未フォローの運営には伏字ではなく全文が出る", async () => {
    const post = {
      ...createFreePrivatePost(),
      generation_type: "coordinate" as const,
      prompt_visibility: undefined,
      source_reference: null,
      prompt: "reported prompt",
    } as Post;

    await act(async () => {
      renderStatic(post, { viewerIsAdmin: true });
    });

    await waitFor(() => {
      expect(screen.getByText("reported prompt")).toBeInTheDocument();
    });
    expect(screen.queryByText("***************")).not.toBeInTheDocument();
  });
});
