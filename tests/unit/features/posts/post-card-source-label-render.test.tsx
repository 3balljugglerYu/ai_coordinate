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

import { render, screen, within } from "@testing-library/react";
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

// カタログ刷新(公開前は運営だけ)の可否。既定は刷新前(一般の利用者)
const mockRevamp = jest.fn<boolean, []>(() => false);
jest.mock("@/features/style-presets/hooks/useStylesCatalogRevamp", () => ({
  useStylesCatalogRevamp: () => mockRevamp(),
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

/*
  左下の生成方法ラベル。カタログ刷新後(公開前は運営だけ)は、自分のプロンプトの投稿に
  User ORIGINAL を出し、使って作った投稿(ペルスタのスタイル・ほかの人のプロンプト)には出さない。
  出どころは画像の下の引用元カードが示す(2026-09-30 ユーザー決定)。
*/
describe("PostCard の生成方法ラベル", () => {
  afterEach(() => mockRevamp.mockReturnValue(false));

  it("刷新後: 自分のプロンプトで作った投稿は User ORIGINAL を出す", () => {
    mockRevamp.mockReturnValue(true);
    const post = makePost({ generation_type: "free", source_post_id: null });
    render(<PostCard post={post} />);

    expect(screen.getByText("modeUserOriginal")).toBeTruthy();
    expect(screen.queryByText("modeFree")).toBeNull();
  });

  it.each([
    ["ペルスタのスタイル", makePost({ generation_type: "one_tap_style" })],
    ["ほかの人のプロンプト", makePost({ generation_type: "free", source_post_id: "source-post-1" })],
  ])("刷新後: %sで作った投稿には画像の上のラベルを出さない", (_label, post) => {
    mockRevamp.mockReturnValue(true);
    render(<PostCard post={post} />);

    for (const key of [
      "modeWithPerstaOriginal",
      "modeWithUserOriginal",
      "modeOneTapStyle",
      "modeFree",
    ]) {
      expect(screen.queryByText(key)).toBeNull();
    }
  });

  it("刷新後も Coordinate のラベルは出す", () => {
    mockRevamp.mockReturnValue(true);
    const post = makePost({ generation_type: "coordinate" });
    render(<PostCard post={post} />);

    expect(screen.getByText("modeCoordinate")).toBeTruthy();
  });

  /*
    刷新後の名前(User ORIGINAL)は従来より長く、角に重ねる従来の形では幅 320px で
    右下の「元画像 ✔︎」と重なった。1つの行に並べ、入りきらないときは左下が折り返す。
  */
  it("刷新後は、左下のラベルと右下の元画像を1つの行に並べる", () => {
    mockRevamp.mockReturnValue(true);
    render(
      <PostCard
        post={makePost({
          generation_type: "free",
          pre_generation_storage_path: SOURCE_PATH,
          show_before_image: true,
        })}
      />
    );

    const row = screen.getByTestId("post-card-corner-row");
    expect(within(row).getByText("modeUserOriginal")).toBeTruthy();
    const source = within(row).getByText("sourceImageLabel");
    // 右下は縮めず右端へ寄せる(左下の方が折り返す)
    expect(source.className).toContain("shrink-0");
    expect(source.className).toContain("ml-auto");
    expect(screen.getAllByText("sourceImageLabel")).toHaveLength(1);
  });

  it("刷新後も、元画像が無い投稿には右下を出さない", () => {
    mockRevamp.mockReturnValue(true);
    render(
      <PostCard post={makePost({ generation_type: "free", pre_generation_storage_path: null })} />
    );

    const row = screen.getByTestId("post-card-corner-row");
    expect(within(row).getByText("modeUserOriginal")).toBeTruthy();
    expect(screen.queryByText("sourceImageLabel")).toBeNull();
  });

  it("一般の利用者は従来どおり、左下と右下を別々に角へ重ねる(行を作らない)", () => {
    mockRevamp.mockReturnValue(false);
    render(
      <PostCard
        post={makePost({
          generation_type: "one_tap_style",
          pre_generation_storage_path: SOURCE_PATH,
          show_before_image: true,
        })}
      />
    );

    expect(screen.queryByTestId("post-card-corner-row")).toBeNull();
    expect(screen.getByText("modeOneTapStyle").className).toContain("absolute bottom-2 left-2");
    expect(screen.getByText("sourceImageLabel").className).toContain("absolute bottom-2 right-2");
  });

  it("⭐一般の利用者には、ほかの人のプロンプトで作った投稿も今の名前(modeFree)のまま", () => {
    mockRevamp.mockReturnValue(false);
    render(
      <PostCard post={makePost({ generation_type: "free", source_post_id: "source-post-1" })} />
    );

    expect(screen.getByText("modeFree")).toBeTruthy();
    expect(screen.queryByText("modeWithUserOriginal")).toBeNull();
  });
});
