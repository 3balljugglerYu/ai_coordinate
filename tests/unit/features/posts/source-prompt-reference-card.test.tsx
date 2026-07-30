/**
 * 参照カードのテスト。
 *
 * ここが誤ると (a) 使えない原作へ生成を促す、(b) 利用不可の原因が
 * サムネイルの有無や文言から推測できる、(c) フォロー先が原作者でなく
 * 投稿者になる、のいずれかが起きる（REQ-011 / REQ-013 / REQ-014 / ADR-003 /
 * ADR-005）。
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { useTranslations } from "next-intl";
import { SourcePromptReferenceCard } from "@/features/posts/components/SourcePromptReferenceCard";
import type { SourcePromptReference } from "@/features/posts/types";

jest.mock("next-intl", () => ({
  useTranslations: jest.fn(),
}));

jest.mock("next/dynamic", () => ({
  __esModule: true,
  // シートは押すまで読み込まれない。テストでは存在しないものとして扱う。
  default: () => () => null,
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) =>
    React.createElement("a", { href, ...props }, children),
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

jest.mock("@/features/users/components/FollowButton", () => ({
  FollowButton: ({ userId }: { userId: string }) => (
    <button type="button" data-testid="follow-button" data-user-id={userId}>
      フォロー
    </button>
  ),
}));

const translations = {
  sourcePromptCardTitle: "このプロンプトで作る",
  sourcePromptCardTitleDerived: "原作のプロンプトで作る",
  sourcePromptCredit: ({ name }: { name: string }) => `原作 ${name}`,
  sourcePromptUsageCount: ({ count }: { count: number }) =>
    `${count}人がこのプロンプトを使いました`,
  sourcePromptUnavailable: "現在、ご利用できません",
  sourcePromptFollowToUse: "フォローすると使えます",
  sourcePromptLoginToUse: "ログインすると使えます",
  sourcePromptThumbnailAlt: "原作の作品",
  beforeImageAlt: "生成元画像",
  beforeImageLabel: "Before",
  afterImageLabel: "After",
  sourcePromptViewProfile: "プロフィールへ",
} as const;

const translator = ((
  key: keyof typeof translations,
  values?: Record<string, unknown>
) => {
  const entry = translations[key];
  return typeof entry === "function" ? entry(values as never) : entry;
}) as unknown as ReturnType<typeof useTranslations>;

const AUTHOR_ID = "33333333-3333-4333-8333-333333333333";
const VIEWER_ID = "44444444-4444-4444-8444-444444444444";
const ORIGIN_POST_ID = "22222222-2222-4222-8222-222222222222";

function buildReference(
  overrides: Partial<SourcePromptReference> = {}
): SourcePromptReference {
  return {
    postId: ORIGIN_POST_ID,
    isAvailable: true,
    authorId: AUTHOR_ID,
    authorNickname: "原作者さん",
    authorAvatarUrl: "https://cdn.example/a.png",
    thumbnailUrl: "https://cdn.example/thumb.webp",
    thumbnailWidth: 896,
    thumbnailHeight: 1152,
    beforeThumbnailUrl: null,
    usageCount: 42,
    ...overrides,
  };
}

function renderCard(props: Partial<
  React.ComponentProps<typeof SourcePromptReferenceCard>
> = {}) {
  return render(
    <SourcePromptReferenceCard
      reference={buildReference()}
      currentUserId={VIEWER_ID}
      isFollowingAuthor
      isDerivedPost={false}
      subscriptionPlan="free"
      {...props}
    />
  );
}

/**
 * サムネイル枠。JSDOM では React が style 属性を書かず CSSOM へ直接入れるため、
 * `[style*='aspect-ratio']` のようなセレクタでは引けない。
 */
function thumbnailFrame(): HTMLElement {
  return screen.getByTestId("source-prompt-after-frame");
}

/** Before/After を並べる外枠（flex-row / flex-col を確認する）。 */
function thumbnailRow(): HTMLElement {
  const parent = thumbnailFrame().parentElement;
  if (!parent) {
    throw new Error("thumbnail row not found");
  }
  return parent;
}

beforeEach(() => {
  jest.clearAllMocks();
  (useTranslations as jest.MockedFunction<typeof useTranslations>)
    .mockReturnValue(translator);
});

describe("生成できる状態", () => {
  it("フォロー済みなら生成ボタンを出す", () => {
    renderCard();

    expect(
      screen.getByRole("button", { name: /このプロンプトで作る/ })
    ).toBeInTheDocument();
  });

  it("原作者自身はフォロー不要で生成できる", () => {
    renderCard({ currentUserId: AUTHOR_ID, isFollowingAuthor: false });

    expect(
      screen.getByRole("button", { name: /このプロンプトで作る/ })
    ).toBeInTheDocument();
    // 自分をフォローするボタンは出さない
    expect(screen.queryByTestId("follow-button")).not.toBeInTheDocument();
  });

  it("クレジットと利用数を出す", () => {
    renderCard();

    expect(screen.getByText("原作 原作者さん")).toBeInTheDocument();
    expect(
      screen.getByText("42人がこのプロンプトを使いました")
    ).toBeInTheDocument();
  });

  it("利用数が0なら人数を出さない", () => {
    // 「0人が使いました」は使われていない印象を与えるだけで役に立たない
    renderCard({ reference: buildReference({ usageCount: 0 }) });

    expect(screen.queryByText(/人がこのプロンプトを使いました/)).toBeNull();
  });
});

describe("押せない理由の出し分け", () => {
  it("未フォローならフォローを促し、カード内にフォローボタンを出す", () => {
    renderCard({ isFollowingAuthor: false });

    expect(screen.getByText("フォローすると使えます")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /このプロンプトで作る/ })
    ).toBeNull();
    // フォロー先は原作者（ADR-003）
    expect(screen.getByTestId("follow-button")).toHaveAttribute(
      "data-user-id",
      AUTHOR_ID
    );
  });

  it("未ログインならログインを促す", () => {
    renderCard({ currentUserId: null, isFollowingAuthor: false });

    expect(screen.getByText("ログインすると使えます")).toBeInTheDocument();
  });

  it("原作が使えないときは理由を1つの文言にまとめる", () => {
    // 削除・投稿取消・公開停止・公開へ戻された、を区別できると
    // 原作の状態を推測できてしまう（ADR-005）
    renderCard({
      reference: buildReference({ isAvailable: false, thumbnailUrl: null }),
    });

    expect(screen.getByText("現在、ご利用できません")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /このプロンプトで作る/ })
    ).toBeNull();
  });

  it("原作が使えないときはフォローを促さない", () => {
    // フォローしても解決しないので、次の行動として示すのは誤り
    renderCard({
      reference: buildReference({ isAvailable: false, thumbnailUrl: null }),
      isFollowingAuthor: false,
    });

    expect(screen.queryByTestId("follow-button")).not.toBeInTheDocument();
  });
});

describe("サムネイル", () => {
  it("利用可能ならサムネイルを出す", () => {
    renderCard();

    expect(screen.getByAltText("原作の作品")).toHaveAttribute(
      "src",
      "https://cdn.example/thumb.webp"
    );
  });

  it("利用不可ならサムネイルを出さない (REQ-014)", () => {
    renderCard({
      reference: buildReference({ isAvailable: false, thumbnailUrl: null }),
    });

    expect(screen.queryByAltText("原作の作品")).not.toBeInTheDocument();
  });
});

describe("サムネイルの比率", () => {
  it("原作の実寸に合わせる", () => {
    // 固定枠に押し込むと、縦横比がまちまちなユーザー生成物が切り取られる
    renderCard({
      reference: buildReference({ thumbnailWidth: 896, thumbnailHeight: 1152 }),
    });

    expect(thumbnailFrame().style.aspectRatio).toBe(String(896 / 1152));
  });

  it("横長の原作も比率どおりに描く", () => {
    renderCard({
      reference: buildReference({ thumbnailWidth: 1536, thumbnailHeight: 864 }),
    });

    expect(thumbnailFrame().style.aspectRatio).toBe(String(1536 / 864));
  });

  it("実寸が無ければ既定比率へ倒す", () => {
    // width/height は lazy compute なので未取得の行がある
    renderCard({
      reference: buildReference({ thumbnailWidth: null, thumbnailHeight: null }),
    });

    expect(thumbnailFrame().style.aspectRatio).toBe(String(180 / 240));
  });

  it("片方だけ欠けている場合も既定比率へ倒す", () => {
    renderCard({
      reference: buildReference({ thumbnailWidth: 896, thumbnailHeight: null }),
    });

    expect(thumbnailFrame().style.aspectRatio).toBe(String(180 / 240));
  });
});

describe("Before/After の並べ表示", () => {
  const WITH_BEFORE = {
    thumbnailUrl: "https://cdn.example/after.webp",
    beforeThumbnailUrl: "https://cdn.example/before.webp",
  };

  it("原作が生成元画像を表示する設定なら2枚並べる", () => {
    // After 1枚では「プロンプトの効果」と「元のうちの子の魅力」が区別できない
    renderCard({ reference: buildReference(WITH_BEFORE) });

    expect(screen.getByAltText("原作の作品")).toBeInTheDocument();
    expect(screen.getByAltText("生成元画像")).toBeInTheDocument();
  });

  it("2枚のときは Before / After のラベルを重ねる", () => {
    // ラベルが無いと「結果が2枚ある」と誤読される
    renderCard({ reference: buildReference(WITH_BEFORE) });

    expect(screen.getByText("Before")).toBeInTheDocument();
    expect(screen.getByText("After")).toBeInTheDocument();
  });

  it("1枚のときはラベルを出さない", () => {
    renderCard();

    expect(screen.queryByText("Before")).not.toBeInTheDocument();
    expect(screen.queryByText("After")).not.toBeInTheDocument();
  });

  it("縦長は横並びにする", () => {
    renderCard({
      reference: buildReference({
        ...WITH_BEFORE,
        thumbnailWidth: 896,
        thumbnailHeight: 1152,
      }),
    });

    expect(thumbnailRow().className).toContain("flex-row");
  });

  it("正方形も横並びにする", () => {
    renderCard({
      reference: buildReference({
        ...WITH_BEFORE,
        thumbnailWidth: 1024,
        thumbnailHeight: 1024,
      }),
    });

    expect(thumbnailRow().className).toContain("flex-row");
  });

  it("横長は縦並びにする", () => {
    // 横長を横並びにすると全体が極端に横長になる
    renderCard({
      reference: buildReference({
        ...WITH_BEFORE,
        thumbnailWidth: 1536,
        thumbnailHeight: 864,
      }),
    });

    expect(thumbnailRow().className).toContain("flex-col");
  });

  it("Before が無ければ横長でも縦並びにしない", () => {
    // 1枚のときは並べる相手がいないので向きの分岐に入らない
    renderCard({
      reference: buildReference({
        thumbnailWidth: 1536,
        thumbnailHeight: 864,
      }),
    });

    expect(thumbnailRow().className).not.toContain("flex-col");
  });

  it("両セルは After の比率を共有する", () => {
    // Before の実寸は保存していないため、After の比率に合わせて object-top で
    // 顔を残す（詳細は types.ts のコメント）
    renderCard({
      reference: buildReference({
        ...WITH_BEFORE,
        thumbnailWidth: 896,
        thumbnailHeight: 1152,
      }),
    });

    const before = screen.getByTestId("source-prompt-before-frame");
    expect(before.style.aspectRatio).toBe(String(896 / 1152));
    expect(thumbnailFrame().style.aspectRatio).toBe(String(896 / 1152));
  });

  it("利用不可なら Before も出さない", () => {
    // REQ-014: 利用不可のときサムネイルを含めない
    renderCard({
      reference: buildReference({
        isAvailable: false,
        thumbnailUrl: null,
        beforeThumbnailUrl: null,
      }),
    });

    expect(screen.queryByAltText("生成元画像")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("source-prompt-before-frame")
    ).not.toBeInTheDocument();
  });
});

describe("表題", () => {
  it("root の非公開投稿では「このプロンプトで作る」", () => {
    renderCard({ isDerivedPost: false });

    expect(screen.getAllByText("このプロンプトで作る").length).toBeGreaterThan(0);
  });

  it("派生投稿では「原作のプロンプトで作る」", () => {
    renderCard({ isDerivedPost: true });

    expect(screen.getByText("原作のプロンプトで作る")).toBeInTheDocument();
  });
});

describe("プロフィールへの導線", () => {
  it("原作者のプロフィールへリンクする", () => {
    renderCard();

    expect(
      screen.getByRole("link", { name: /プロフィールへ/ })
    ).toHaveAttribute("href", `/users/${AUTHOR_ID}`);
  });

  it("原作が使えなくなっていても出す", () => {
    // 作者は実在しており、クレジットは保持する仕様（REQ-011）。
    // 「使えないけれど誰の作品かは辿れる」状態が正しい。
    renderCard({
      reference: buildReference({ isAvailable: false, thumbnailUrl: null }),
    });

    expect(
      screen.getByRole("link", { name: /プロフィールへ/ })
    ).toBeInTheDocument();
  });

  it("未ログインでも出す", () => {
    // 作者を見に行くだけならログインは要らない
    renderCard({ currentUserId: null, isFollowingAuthor: false });

    expect(
      screen.getByRole("link", { name: /プロフィールへ/ })
    ).toBeInTheDocument();
  });

  it("原作者自身には出さない", () => {
    // 自分のプロフィールへ飛ばすリンクは雑音（フォローボタンと同じ理由）
    renderCard({ currentUserId: AUTHOR_ID, isFollowingAuthor: false });

    expect(
      screen.queryByRole("link", { name: /プロフィールへ/ })
    ).not.toBeInTheDocument();
  });

  it("原作者が分からないときは出さない", () => {
    // 飛ばす先が無い
    renderCard({
      reference: buildReference({
        authorId: null,
        authorNickname: null,
        isAvailable: false,
        thumbnailUrl: null,
      }),
    });

    expect(
      screen.queryByRole("link", { name: /プロフィールへ/ })
    ).not.toBeInTheDocument();
  });
});

describe("秘匿", () => {
  it("プロンプト本文を描画しない", () => {
    // reference にはそもそも本文が入らないが、将来 payload が増えたときに
    // 画面へ出さないことを固定しておく
    const { container } = renderCard();

    expect(container.textContent).not.toContain("prompt");
    expect(Object.keys(buildReference())).not.toContain("prompt");
  });
});
