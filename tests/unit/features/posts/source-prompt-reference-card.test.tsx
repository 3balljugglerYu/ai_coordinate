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

describe("秘匿", () => {
  it("プロンプト本文を描画しない", () => {
    // reference にはそもそも本文が入らないが、将来 payload が増えたときに
    // 画面へ出さないことを固定しておく
    const { container } = renderCard();

    expect(container.textContent).not.toContain("prompt");
    expect(Object.keys(buildReference())).not.toContain("prompt");
  });
});
