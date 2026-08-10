/**
 * フィード用カードのテスト。
 *
 * ここが誤ると (a) Before があるのに After 1枚しか出ない（プロンプトの効果が
 * 伝わらない）、(b) 画像を押しただけで詳細へ飛ぶ、(c) フォロー済みの相手に
 * フォローボタンが出る、のいずれかが起きる。
 */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { PostFeedCard } from "@/features/posts/components/PostFeedCard";
import type { Post } from "@/features/posts/types";

const pushMock = jest.fn();

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "ja",
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    React.createElement("a", { href, ...props }, children),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ alt, src, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) =>
    React.createElement("img", { alt, src, ...props }),
}));

jest.mock("react-intersection-observer", () => ({
  useInView: () => ({ ref: jest.fn(), inView: false }),
}));

const fullscreenSpy = jest.fn();
jest.mock("@/features/posts/components/ImageFullscreen", () => ({
  ImageFullscreen: (props: { initialIndex: number; images: { url: string }[] }) => {
    fullscreenSpy(props);
    return <div data-testid="image-fullscreen" data-index={props.initialIndex} />;
  },
}));

jest.mock("@/features/posts/components/PostCardLikeButton", () => ({
  PostCardLikeButton: () => <div data-testid="like-button" />,
}));

jest.mock("@/features/moderation/components/PostModerationMenu", () => ({
  PostModerationMenu: () => <div data-testid="moderation-menu" />,
}));

jest.mock("@/features/users/components/FollowButton", () => ({
  FollowButton: ({ userId }: { userId: string }) => (
    <div data-testid={`follow-button-${userId}`} />
  ),
}));

jest.mock("@/features/posts/components/FollowAndUsePromptButton", () => ({
  FollowAndUsePromptButton: ({
    summary,
  }: {
    summary: { originPostId: string };
  }) => <div data-testid="cta" data-origin={summary.originPostId} />,
}));

jest.mock("@/lib/env", () => ({
  isPostImpressionsEnabled: () => false,
}));

jest.mock("@/features/posts/lib/impressions-client", () => ({
  queuePostImpression: jest.fn(),
}));

function createPost(overrides: Partial<Post> = {}): Post {
  return {
    id: "post-1",
    user_id: "author-1",
    caption: "うちの子のコーデ",
    storage_path: "images/after.png",
    // storage_path からの URL 生成は NEXT_PUBLIC_SUPABASE_URL に依存するため、
    // テストでは URL を直接持たせて env に左右されないようにする
    image_url: "https://example.test/after.png",
    created_at: "2026-08-10T00:00:00.000Z",
    posted_at: "2026-08-10T00:00:00.000Z",
    is_posted: true,
    prompt: "",
    width: 896,
    height: 1152,
    user: { id: "author-1", nickname: "みきふく" },
    ...overrides,
  } as Post;
}

describe("PostFeedCard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Before / After", () => {
    test("Before があれば2枚を並べ_両セルが After の比率を共有する", () => {
      render(
        <PostFeedCard
          post={createPost({ input_image_url_fallback: "https://example.test/before.png" })}
          currentUserId={null}
        />
      );

      const after = screen.getByTestId("post-feed-after-frame");
      const before = screen.getByTestId("post-feed-before-frame");
      expect(after.style.aspectRatio).toBe(String(896 / 1152));
      expect(before.style.aspectRatio).toBe(String(896 / 1152));
      // 縦長は左右に並べる
      expect(after.parentElement?.className).not.toContain("flex-col");
    });

    test("Before が無い投稿(One-Tap・完走)は1枚だけ出す", () => {
      render(<PostFeedCard post={createPost()} currentUserId={null} />);

      expect(screen.getByTestId("post-feed-after-frame")).toBeInTheDocument();
      expect(screen.queryByTestId("post-feed-before-frame")).not.toBeInTheDocument();
    });

    test("show_before_image が false なら Before を出さない(投稿者の設定を尊重)", () => {
      render(
        <PostFeedCard
          post={createPost({
            input_image_url_fallback: "https://example.test/before.png",
            show_before_image: false,
          })}
          currentUserId={null}
        />
      );

      expect(screen.queryByTestId("post-feed-before-frame")).not.toBeInTheDocument();
    });

    test("横長は上下に並べる", () => {
      render(
        <PostFeedCard
          post={createPost({
            width: 1536,
            height: 1024,
            input_image_url_fallback: "https://example.test/before.png",
          })}
          currentUserId={null}
        />
      );

      expect(screen.getByTestId("post-feed-after-frame").parentElement?.className).toContain(
        "flex-col"
      );
    });
  });

  describe("タップ領域", () => {
    test("画像タップは拡大ビューを開き_詳細へは飛ばさない", () => {
      render(
        <PostFeedCard
          post={createPost({ input_image_url_fallback: "https://example.test/before.png" })}
          currentUserId={null}
        />
      );

      fireEvent.click(screen.getByTestId("post-feed-after-frame"));

      expect(screen.getByTestId("image-fullscreen")).toHaveAttribute("data-index", "0");
      expect(pushMock).not.toHaveBeenCalled();
    });

    test("Before をタップすると拡大ビューの2枚目から開く", () => {
      render(
        <PostFeedCard
          post={createPost({ input_image_url_fallback: "https://example.test/before.png" })}
          currentUserId={null}
        />
      );

      fireEvent.click(screen.getByTestId("post-feed-before-frame"));

      expect(screen.getByTestId("image-fullscreen")).toHaveAttribute("data-index", "1");
      expect(fullscreenSpy.mock.calls[0][0].images).toHaveLength(2);
    });

    test("コメントアイコンは詳細へ移動する", () => {
      render(<PostFeedCard post={createPost()} currentUserId={null} />);

      fireEvent.click(screen.getByLabelText("feedComments"));

      expect(pushMock).toHaveBeenCalledWith("/ja/posts/post-1");
    });
  });

  describe("フォローボタン", () => {
    test("未フォローの他人の投稿には出す", () => {
      render(
        <PostFeedCard
          post={createPost()}
          currentUserId="viewer-1"
          isFollowingAuthor={false}
        />
      );
      expect(screen.getByTestId("follow-button-author-1")).toBeInTheDocument();
    });

    test("フォロー済みには出さない", () => {
      render(
        <PostFeedCard post={createPost()} currentUserId="viewer-1" isFollowingAuthor />
      );
      expect(screen.queryByTestId("follow-button-author-1")).not.toBeInTheDocument();
    });

    test("フォロー状態が未取得(undefined)のうちは出さない(取得後にちらつかせない)", () => {
      render(<PostFeedCard post={createPost()} currentUserId="viewer-1" />);
      expect(screen.queryByTestId("follow-button-author-1")).not.toBeInTheDocument();
    });

    test("自分の投稿には出さない", () => {
      render(
        <PostFeedCard
          post={createPost()}
          currentUserId="author-1"
          isFollowingAuthor={false}
        />
      );
      expect(screen.queryByTestId("follow-button-author-1")).not.toBeInTheDocument();
    });

    test("未ログインには出さない", () => {
      render(
        <PostFeedCard post={createPost()} currentUserId={null} isFollowingAuthor={false} />
      );
      expect(screen.queryByTestId("follow-button-author-1")).not.toBeInTheDocument();
    });
  });

  describe("このプロンプトで作る", () => {
    const summary = {
      originPostId: "origin-1",
      isAvailable: true,
      originAuthorId: "author-1",
      originAuthorNickname: "みきふく",
      usageCount: 3,
      promptVisibility: "private" as const,
    };

    test("サマリがある投稿にだけ CTA を出す", () => {
      const { rerender } = render(
        <PostFeedCard post={createPost()} currentUserId="viewer-1" isFollowingAuthor />
      );
      expect(screen.queryByTestId("cta")).not.toBeInTheDocument();

      rerender(
        <PostFeedCard
          post={createPost()}
          currentUserId="viewer-1"
          isFollowingAuthor
          promptAction={summary}
        />
      );
      expect(screen.getByTestId("cta")).toHaveAttribute("data-origin", "origin-1");
    });

    test("CTA が「フォローして使う」を出す状態なら作者行のフォローボタンは隠す", () => {
      render(
        <PostFeedCard
          post={createPost()}
          currentUserId="viewer-1"
          isFollowingAuthor={false}
          promptAction={summary}
        />
      );

      expect(screen.getByTestId("cta")).toBeInTheDocument();
      // 同じ相手への導線が2つ並ばないこと
      expect(screen.queryByTestId("follow-button-author-1")).not.toBeInTheDocument();
    });

    test("原作者が投稿者と別人(派生投稿)なら作者行のフォローボタンは残す", () => {
      render(
        <PostFeedCard
          post={createPost()}
          currentUserId="viewer-1"
          isFollowingAuthor={false}
          promptAction={{ ...summary, originAuthorId: "other-author" }}
        />
      );

      expect(screen.getByTestId("follow-button-author-1")).toBeInTheDocument();
    });

    test("原作が使えないならフォローボタンは通常どおり出す", () => {
      render(
        <PostFeedCard
          post={createPost()}
          currentUserId="viewer-1"
          isFollowingAuthor={false}
          promptAction={{ ...summary, isAvailable: false }}
        />
      );

      expect(screen.getByTestId("follow-button-author-1")).toBeInTheDocument();
    });
  });

  test("完走投稿にはコンプリートバッジを出す", () => {
    render(
      <PostFeedCard post={createPost({ completion_id: "completion-1" })} currentUserId={null} />
    );
    expect(screen.getByText("completionBadge")).toBeInTheDocument();
  });

  test("キャプションが無くても破綻しない", () => {
    render(<PostFeedCard post={createPost({ caption: null })} currentUserId={null} />);
    expect(screen.queryByTestId("feed-caption")).not.toBeInTheDocument();
    expect(screen.getByTestId("post-feed-after-frame")).toBeInTheDocument();
  });
});
