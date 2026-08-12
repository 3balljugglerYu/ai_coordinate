/**
 * フィード用カードのテスト。
 *
 * ここが誤ると (a) Before があるのに After 1枚しか出ない（プロンプトの効果が
 * 伝わらない）、(b) 画像を押しただけで詳細へ飛ぶ、(c) フォロー済みの相手に
 * フォローボタンが出る、のいずれかが起きる。
 */

import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
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
  // unoptimized は img の属性にならないため、検証できるよう data 属性へ移す
  default: ({
    alt,
    src,
    unoptimized,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) =>
    React.createElement("img", {
      alt,
      src,
      "data-unoptimized": String(Boolean(unoptimized)),
      ...props,
    }),
}));

// 既定は「見えていない」。インプレッション計測のテストだけ true にする
// (jest.mock のファクトリから参照するため mock 接頭辞が要る)
let mockInView = false;
jest.mock("react-intersection-observer", () => ({
  useInView: () => ({ ref: jest.fn(), inView: mockInView }),
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

const quoteSpy = jest.fn();
jest.mock("@/features/posts/components/FeedSourceQuote", () => ({
  FeedSourceQuote: (props: {
    variant: string;
    title?: string;
    href?: string | null;
    thumbnailUrl?: string | null;
    action?: React.ReactNode;
  }) => {
    quoteSpy(props);
    return (
      <div
        data-testid="feed-source-quote"
        data-variant={props.variant}
        data-title={props.title ?? ""}
        data-href={props.href ?? ""}
      >
        {props.action}
      </div>
    );
  },
}));

/** 引用カードに渡された props。 */
function quoteProps(): {
  variant: string;
  title?: string;
  href?: string | null;
  thumbnailUrl?: string | null;
} {
  return quoteSpy.mock.calls[quoteSpy.mock.calls.length - 1][0];
}

const ctaSpy = jest.fn();
jest.mock("@/features/posts/components/FollowAndUsePromptButton", () => ({
  FollowAndUsePromptButton: (props: {
    summary: { originPostId: string };
    isFollowingAuthor?: boolean;
  }) => {
    ctaSpy(props);
    return <div data-testid="cta" data-origin={props.summary.originPostId} />;
  },
}));

/** CTA に渡された props（フォロー判定の取り違えを検出する）。 */
function ctaProps(): { isFollowingAuthor?: boolean } {
  return ctaSpy.mock.calls[ctaSpy.mock.calls.length - 1][0];
}

let mockImpressionsEnabled = false;
jest.mock("@/lib/env", () => ({
  isPostImpressionsEnabled: () => mockImpressionsEnabled,
}));

const mockQueueImpression = jest.fn();
jest.mock("@/features/posts/lib/impressions-client", () => ({
  queuePostImpression: (...args: unknown[]) => mockQueueImpression(...args),
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
    mockInView = false;
    mockImpressionsEnabled = false;
  });

  describe("インプレッション計測", () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    test("可視50%が1秒続いたら feed として記録する", () => {
      /*
        グリッド(PostCard)と条件は同じにするが、記録する表示形式が違う。
        ここが grid のままだと内訳が全部グリッドに寄り、フィード既定化の
        判断材料にならない。
      */
      jest.useFakeTimers();
      mockInView = true;
      mockImpressionsEnabled = true;

      render(<PostFeedCard post={createPost()} trackImpressions />);

      act(() => {
        jest.advanceTimersByTime(999);
      });
      expect(mockQueueImpression).not.toHaveBeenCalled();

      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(mockQueueImpression).toHaveBeenCalledWith("post-1", "feed");
    });

    test("trackImpressions を渡さなければ計測しない", () => {
      jest.useFakeTimers();
      mockInView = true;
      mockImpressionsEnabled = true;

      render(<PostFeedCard post={createPost()} />);

      act(() => {
        jest.advanceTimersByTime(2000);
      });
      expect(mockQueueImpression).not.toHaveBeenCalled();
    });
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

    test("Before なしの縦長は高さを幅までに収め_切らずに中央へ置く", () => {
      /*
        1枚表示の縦長をそのまま出すと画面をほぼ占有し、Before/After を並べた
        投稿より目立つ。「Before を出さない方が大きく見える」状態は施策の狙いと
        逆を向くため、高さを幅までに収める。切り取らず左右に余白を作る。
      */
      render(<PostFeedCard post={createPost()} currentUserId={null} />);

      const after = screen.getByTestId("post-feed-after-frame");
      expect(after.style.aspectRatio).toBe("1");
      expect(after.querySelector("img")?.className).toContain("object-contain");
    });

    test("Before なしの横長はそのままの比率(高さは元から幅以下)", () => {
      render(
        <PostFeedCard post={createPost({ width: 1536, height: 1024 })} currentUserId={null} />
      );

      expect(screen.getByTestId("post-feed-after-frame").style.aspectRatio).toBe(
        String(1536 / 1024)
      );
    });

    test("Before がある縦長は実寸の比率のまま(1セルが半分の幅なので伸びすぎない)", () => {
      render(
        <PostFeedCard
          post={createPost({ input_image_url_fallback: "https://example.test/before.png" })}
          currentUserId={null}
        />
      );

      expect(screen.getByTestId("post-feed-after-frame").style.aspectRatio).toBe(
        String(896 / 1152)
      );
    });

    test("Before/After が並ぶときは片方だけ遅れないよう両方に先読みを効かせる", () => {
      /*
        After だけ priority だと、並んでいるのに Before だけ後から差し込まれる。
        1枚の絵として同時に出す。
      */
      render(
        <PostFeedCard
          post={createPost({ input_image_url_fallback: "https://example.test/before.png" })}
          currentUserId={null}
          prioritizeImage
        />
      );

      const after = screen.getByTestId("post-feed-after-frame").querySelector("img");
      const before = screen.getByTestId("post-feed-before-frame").querySelector("img");
      expect(after?.getAttribute("priority")).toBe(before?.getAttribute("priority"));
    });

    test("横に並ぶセルには半分の幅で sizes を渡す(2倍の解像度を落とさない)", () => {
      render(
        <PostFeedCard
          post={createPost({ input_image_url_fallback: "https://example.test/before.png" })}
          currentUserId={null}
        />
      );

      const sizes = screen
        .getByTestId("post-feed-after-frame")
        .querySelector("img")
        ?.getAttribute("sizes");
      expect(sizes).toContain("50vw");
      expect(sizes).toContain("300px");
    });

    test("1枚表示は全幅で sizes を渡す", () => {
      render(<PostFeedCard post={createPost()} currentUserId={null} />);

      const sizes = screen
        .getByTestId("post-feed-after-frame")
        .querySelector("img")
        ?.getAttribute("sizes");
      expect(sizes).toContain("100vw");
    });

    test("画像はグリッドと同じ URL で出す(切り替え時にキャッシュを再利用する)", () => {
      /*
        最適化を通すと /_next/image?url=... に変わり、グリッドで見た直後に
        フィードへ切り替えてもキャッシュが1枚も効かず全部取り直しになる。
      */
      render(<PostFeedCard post={createPost()} currentUserId={null} />);

      const img = screen.getByTestId("post-feed-after-frame").querySelector("img");
      expect(img?.getAttribute("src")).toBe("https://example.test/after.png");
      expect(img?.getAttribute("data-unoptimized")).toBe("true");
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

    test("カード地をタップすると詳細へ移動する(キャプション無しでも辿り着ける)", () => {
      render(<PostFeedCard post={createPost({ caption: null })} currentUserId={null} />);

      fireEvent.click(screen.getByTestId("post-feed-card-post-1"));

      expect(pushMock).toHaveBeenCalledWith("/ja/posts/post-1");
    });

    test("キャプションが無いときは1行ぶんの余白を空ける(そこも詳細への領域)", () => {
      const { rerender } = render(
        <PostFeedCard post={createPost({ caption: null })} currentUserId={null} />
      );
      expect(screen.getByTestId("post-feed-card-caption-spacer")).toBeInTheDocument();

      rerender(<PostFeedCard post={createPost()} currentUserId={null} />);
      expect(
        screen.queryByTestId("post-feed-card-caption-spacer")
      ).not.toBeInTheDocument();
    });

    test("時刻から詳細へ行ける(カード地は目に見えないため入口を残す)", () => {
      render(<PostFeedCard post={createPost()} currentUserId={null} />);

      expect(screen.getByTestId("post-feed-card-timestamp")).toHaveAttribute(
        "href",
        "/ja/posts/post-1"
      );
    });

    test("作者アイコンと名前はプロフィールへ行き_詳細へは飛ばない", () => {
      render(<PostFeedCard post={createPost()} currentUserId={null} />);

      const profileLinks = screen
        .getAllByRole("link")
        .filter((link) => link.getAttribute("href") === "/users/author-1");
      // アイコンと名前の2つ
      expect(profileLinks).toHaveLength(2);

      profileLinks.forEach((link) => fireEvent.click(link));
      expect(pushMock).not.toHaveBeenCalled();
    });

    test("画像タップは拡大ビューだけで_カード地の詳細遷移は起きない", () => {
      render(<PostFeedCard post={createPost()} currentUserId={null} />);

      fireEvent.click(screen.getByTestId("post-feed-after-frame"));

      expect(screen.getByTestId("image-fullscreen")).toBeInTheDocument();
      expect(pushMock).not.toHaveBeenCalled();
    });

    test("キャプションの展開でカード地の詳細遷移は起きない", () => {
      render(<PostFeedCard post={createPost()} currentUserId={null} />);

      fireEvent.click(screen.getByTestId("feed-caption"));

      // 短い本文は1タップで詳細(FeedCaption 自身の遷移)。二重に呼ばれない
      expect(pushMock).toHaveBeenCalledTimes(1);
    });

    test("いいねボタンで詳細へ飛ばない", () => {
      render(<PostFeedCard post={createPost()} currentUserId="viewer-1" />);

      fireEvent.click(screen.getByTestId("like-button"));

      expect(pushMock).not.toHaveBeenCalled();
    });

    test("引用ブロックの操作で詳細へ飛ばない", () => {
      render(
        <PostFeedCard
          post={createPost()}
          currentUserId="viewer-1"
          isFollowingPromptAuthor
          promptAction={{
            originPostId: "origin-1",
            isAvailable: true,
            originAuthorId: "author-1",
            originAuthorNickname: "みきふく",
            originAuthorAvatarUrl: null,
            originThumbnailUrl: null,
            originCaption: null,
            usageCount: 0,
            promptVisibility: "private",
          }}
        />
      );

      fireEvent.click(screen.getByTestId("feed-source-quote"));

      expect(pushMock).not.toHaveBeenCalled();
    });

    test("コメントアイコンは詳細へ移動する", () => {
      render(<PostFeedCard post={createPost()} currentUserId={null} />);

      fireEvent.click(screen.getByLabelText("feedComments"));

      expect(pushMock).toHaveBeenCalledWith("/ja/posts/post-1");
      // 親カードにも onClick があるので、伝播を止めないと2回 push されて
      // 履歴が重複する(戻っても同じ画面に留まる)
      expect(pushMock).toHaveBeenCalledTimes(1);
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
      originAuthorAvatarUrl: null,
      originThumbnailUrl: "https://example.test/origin.png",
      originCaption: "赤白ボーダーのマリンコーデ",
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
          isFollowingPromptAuthor={false}
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
          isFollowingPromptAuthor={false}
          promptAction={{ ...summary, originAuthorId: "other-author" }}
        />
      );

      expect(screen.getByTestId("follow-button-author-1")).toBeInTheDocument();
    });

    test("CTA のフォロー判定には原作者の状態を渡す(投稿者の状態ではない)", () => {
      /*
        派生投稿では投稿者と原作者が別人。投稿者をフォロー済みでも原作者が
        未フォローなら「フォローして使う」でなければならない。取り違えると
        「このプロンプトで作る」が出て、生成APIで弾かれる。
      */
      render(
        <PostFeedCard
          post={createPost()}
          currentUserId="viewer-1"
          isFollowingAuthor        // 投稿者はフォロー済み
          isFollowingPromptAuthor={false} // 原作者は未フォロー
          promptAction={{ ...summary, originAuthorId: "other-author" }}
        />
      );

      expect(ctaProps().isFollowingAuthor).toBe(false);
    });

    test("原作者をフォロー済みなら投稿者が未フォローでも CTA はそのまま使える", () => {
      render(
        <PostFeedCard
          post={createPost()}
          currentUserId="viewer-1"
          isFollowingAuthor={false}
          isFollowingPromptAuthor
          promptAction={{ ...summary, originAuthorId: "other-author" }}
        />
      );

      expect(ctaProps().isFollowingAuthor).toBe(true);
      // 投稿者は未フォローなので作者行のボタンは残る
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

  describe("引用元ブロック", () => {
    const summary = {
      originPostId: "origin-1",
      isAvailable: true,
      originAuthorId: "author-1",
      originAuthorNickname: "みきふく",
      originAuthorAvatarUrl: null,
      originThumbnailUrl: "https://example.test/origin.png",
      originCaption: "赤白ボーダーのマリンコーデ",
      usageCount: 12,
      promptVisibility: "private" as const,
    };

    test("派生・free 投稿は原作者と原作へのリンクを引用元に出す", () => {
      render(
        <PostFeedCard
          post={createPost()}
          currentUserId="viewer-1"
          isFollowingPromptAuthor
          promptAction={summary}
        />
      );

      expect(quoteProps().title).toBe("みきふく");
      expect(quoteProps().href).toBe("/posts/origin-1");
      expect(quoteProps().thumbnailUrl).toBe("https://example.test/origin.png");
      // 行動ボタンは引用カードの中に入る(同じ場所にブロックを2つ並べない)
      expect(
        screen.getByTestId("feed-source-quote").querySelector('[data-testid="cta"]')
      ).not.toBeNull();
    });

    test("原作がこの投稿自身なら root として出す(自分を引用しない)", () => {
      render(
        <PostFeedCard
          post={createPost()}
          currentUserId="viewer-1"
          isFollowingPromptAuthor
          promptAction={{ ...summary, originPostId: "post-1" }}
        />
      );

      expect(quoteProps().variant).toBe("root");
      // 自分自身へのリンクは張らない
      expect(quoteProps().href).toBeNull();
    });

    test("原作が別投稿なら derived として原作へのリンクを出す", () => {
      render(
        <PostFeedCard
          post={createPost()}
          currentUserId="viewer-1"
          isFollowingPromptAuthor
          promptAction={summary}
        />
      );

      expect(quoteProps().variant).toBe("derived");
      expect(quoteProps().href).toBe("/posts/origin-1");
    });

    test("原作が使えないときは引用元ごと出さない", () => {
      render(
        <PostFeedCard
          post={createPost()}
          currentUserId="viewer-1"
          promptAction={{ ...summary, isAvailable: false }}
        />
      );
      expect(screen.queryByTestId("feed-source-quote")).not.toBeInTheDocument();
    });

    test("One-Tap 投稿はプリセットを引用元に出す", () => {
      render(
        <PostFeedCard
          post={createPost({
            generation_type: "one_tap_style",
            generation_metadata: {
              oneTapStyle: {
                id: "preset-1",
                title: "夏のマリンコーデ",
                thumbnailImageUrl: "https://example.test/preset.png",
                thumbnailWidth: 300,
                thumbnailHeight: 400,
                hasBackgroundPrompt: false,
                billingMode: "free",
                outputAspectRatioMode: "portrait",
              },
            },
          })}
          currentUserId="viewer-1"
          stylePresetLink={{ presetId: "preset-1", slug: "summer-marine" }}
        />
      );

      expect(quoteProps().variant).toBe("style");
      expect(quoteProps().title).toBe("夏のマリンコーデ");
      expect(quoteProps().href).toBe("/styles/summer-marine");
    });

    test("slug が無い One-Tap プリセットはリンクにしない", () => {
      render(
        <PostFeedCard
          post={createPost({
            generation_type: "one_tap_style",
            generation_metadata: {
              oneTapStyle: {
                id: "preset-1",
                title: "非公開スタイル",
                thumbnailImageUrl: "https://example.test/preset.png",
                thumbnailWidth: 300,
                thumbnailHeight: 400,
                hasBackgroundPrompt: false,
                billingMode: "free",
                outputAspectRatioMode: "portrait",
              },
            },
          })}
          currentUserId="viewer-1"
          stylePresetLink={{ presetId: "preset-1", slug: null }}
        />
      );

      expect(quoteProps().href).toBeNull();
    });

    test("引用元が無い投稿(コーディネート等)には出さない", () => {
      render(
        <PostFeedCard
          post={createPost({ generation_type: "coordinate" })}
          currentUserId="viewer-1"
        />
      );
      expect(screen.queryByTestId("feed-source-quote")).not.toBeInTheDocument();
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
