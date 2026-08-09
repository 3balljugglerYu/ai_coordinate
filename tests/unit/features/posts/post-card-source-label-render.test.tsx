/** @jest-environment jsdom */

/**
 * 投稿カード右下「元画像 ✔︎」ラベルの描画テスト。
 *
 * 表示条件そのものは post-card-source-label.test.ts で固定している。
 * こちらは「条件を満たしたときに実際にカードへ描画されるか」「左下の生成モード
 * ラベルと共存するか」を見る。
 *
 * Persta の生成は必ず画像アップロードを伴うため生成元自体はどの投稿にもあるが、
 * 表示用に永続化された画像は古い投稿には無い。ラベルは「タップすれば見られる」
 * 期待を持たせるため、表示できる投稿だけに出す。
 */

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";

import { render, screen } from "@testing-library/react";
import type { Post } from "@/features/posts/types";

jest.mock("react-intersection-observer", () => ({
  useInView: () => ({ ref: jest.fn(), inView: false }),
}));

jest.mock("@/features/posts/lib/impressions-client", () => ({
  queuePostImpression: jest.fn(),
}));

jest.mock("@/lib/env", () => ({
  isPostImpressionsEnabled: jest.fn(() => false),
}));

jest.mock("next-intl", () => ({
  useLocale: () => "ja",
  // i18n キーをそのまま返し、どのキーが使われたかで判定する
  useTranslations: () => (key: string) => key,
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: { src: string; alt: string }) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={props.src} alt={props.alt} />;
  },
}));

jest.mock("@/features/posts/components/PostCardLikeButton", () => ({
  PostCardLikeButton: () => <div data-testid="like-button" />,
}));

jest.mock("@/features/moderation/components/PostModerationMenu", () => ({
  PostModerationMenu: () => <div data-testid="moderation-menu" />,
}));

import { PostCard } from "@/features/posts/components/PostCard";

const POST_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SOURCE_PATH = "user-1/pre-generation/img-1_display.webp";

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: POST_ID,
    user_id: "user-1",
    image_url: "https://example.com/image.png",
    storage_path: "user-1/image.png",
    prompt: "",
    is_posted: true,
    view_count: 0,
    impression_count: 0,
    ...overrides,
  } as Post;
}

describe("PostCard の生成元ラベル描画", () => {
  it("生成元が表示できる投稿にはラベルを描画する", () => {
    render(
      <PostCard
        post={makePost({
          pre_generation_storage_path: SOURCE_PATH,
          show_before_image: true,
        })}
      />
    );

    expect(screen.getByText("sourceImageLabel")).toBeInTheDocument();
  });

  it("表示OFFの投稿にはラベルを描画しない", () => {
    render(
      <PostCard
        post={makePost({
          pre_generation_storage_path: SOURCE_PATH,
          show_before_image: false,
        })}
      />
    );

    expect(screen.queryByText("sourceImageLabel")).not.toBeInTheDocument();
  });

  it("永続画像が無い投稿にはラベルを描画しない", () => {
    // Before/After 表示機能より前の投稿。生成元はアップロードされているが
    // 表示用の画像が残っていないため、ラベルを出すと裏切りになる。
    render(
      <PostCard
        post={makePost({
          pre_generation_storage_path: null,
          show_before_image: true,
        })}
      />
    );

    expect(screen.queryByText("sourceImageLabel")).not.toBeInTheDocument();
  });

  it("左下の生成モードラベルと同時に描画できる", () => {
    render(
      <PostCard
        post={makePost({
          generation_type: "one_tap_style",
          pre_generation_storage_path: SOURCE_PATH,
          show_before_image: true,
        })}
      />
    );

    // 左下（生成モード）と右下（生成元）が共存すること
    expect(screen.getByText("modeOneTapStyle")).toBeInTheDocument();
    expect(screen.getByText("sourceImageLabel")).toBeInTheDocument();
  });
});

describe("PostCard の完走投稿描画", () => {
  it("コンプリートバッジとコメント数を描画し、タップ先は通常の詳細パス", () => {
    render(
      <PostCard
        post={makePost({
          completion_id: "cmp-1",
          completion_view_mode: "book",
          comment_count: 3,
        })}
      />
    );

    const badge = screen.getByText("completionBadge");
    expect(badge).toBeInTheDocument();
    // タップ先が没入シェアページ(/m/...)ではなく詳細パスであること
    const link = badge.closest("a") ?? document.querySelector("a");
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href") ?? "").toContain(`/posts/${POST_ID}`);
    expect(link?.getAttribute("href") ?? "").not.toContain("/m/");
    // コメント数が表示される(旧仕様では完走投稿のみ非表示だった)
    expect(screen.getByText("3")).toBeInTheDocument();
  });
});
