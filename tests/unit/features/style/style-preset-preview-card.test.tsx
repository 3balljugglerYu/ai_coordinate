/** @jest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { StylePresetPreviewCard } from "@/features/style/components/StylePresetPreviewCard";

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

const COORDINATE_CATEGORY = {
  key: "coordinate",
  displayNameJa: "コーディネート",
  displayNameEn: "Coordinate",
  badgeColor: "#1f2937",
  badgeTextColor: "#ffffff",
} as const;

const CHIBI_CATEGORY = {
  key: "chibi",
  displayNameJa: "ちびキャラ",
  displayNameEn: "Chibi",
  badgeColor: "#ec4899",
  badgeTextColor: "#ffffff",
} as const;

function makePreset(
  overrides: Partial<Parameters<typeof StylePresetPreviewCard>[0]["preset"]> = {},
) {
  return {
    id: "preset-1",
    title: "Spring Code",
    thumbnailImageUrl: "https://example.com/thumb.webp",
    thumbnailWidth: 900,
    thumbnailHeight: 1200,
    hasBackgroundPrompt: false,
    ...overrides,
  };
}

describe("StylePresetPreviewCard - バッジ表示", () => {
  test("category が無いとバッジは表示されない", () => {
    render(
      <StylePresetPreviewCard
        preset={makePreset({ category: undefined })}
        alt="alt"
      />,
    );
    expect(screen.queryByText("コーディネート")).toBeNull();
    expect(screen.queryByText("ちびキャラ")).toBeNull();
  });

  test("category.key === 'coordinate' のときバッジは非表示 (default 扱い)", () => {
    render(
      <StylePresetPreviewCard
        preset={makePreset({ category: COORDINATE_CATEGORY })}
        alt="alt"
      />,
    );
    expect(screen.queryByText("コーディネート")).toBeNull();
    expect(screen.queryByText("Coordinate")).toBeNull();
  });

  test("category.key !== 'coordinate' のとき日本語バッジを表示する (default locale)", () => {
    render(
      <StylePresetPreviewCard
        preset={makePreset({ category: CHIBI_CATEGORY })}
        alt="alt"
      />,
    );
    expect(screen.getByText("ちびキャラ")).toBeInTheDocument();
  });

  test("locale='en' のとき英語バッジを表示する", () => {
    render(
      <StylePresetPreviewCard
        preset={makePreset({ category: CHIBI_CATEGORY })}
        alt="alt"
        locale="en"
      />,
    );
    expect(screen.getByText("Chibi")).toBeInTheDocument();
    expect(screen.queryByText("ちびキャラ")).toBeNull();
  });

  test("バッジに badgeColor / badgeTextColor が style として適用される", () => {
    render(
      <StylePresetPreviewCard
        preset={makePreset({ category: CHIBI_CATEGORY })}
        alt="alt"
      />,
    );
    const badge = screen.getByText("ちびキャラ");
    // inline style はそのまま attribute として出る
    expect(badge.style.backgroundColor).toBe("rgb(236, 72, 153)"); // #ec4899
    expect(badge.style.color).toBe("rgb(255, 255, 255)");
  });
});

const PROVIDER_CATEGORY = {
  key: "godly_dress",
  displayNameJa: "神話の女神ドレス",
  displayNameEn: "Mythic Goddess Dress",
  badgeColor: "#7c3aed",
  badgeTextColor: "#ffffff",
  providerNickname: "mario335599",
  providerAvatarUrl: "https://example.com/avatar.webp",
} as const;

describe("StylePresetPreviewCard - 提供者クレジット", () => {
  test("providerNickname があると提供者アイコン(アイコンのみ)を表示する", () => {
    render(
      <StylePresetPreviewCard
        preset={makePreset({ category: PROVIDER_CATEGORY })}
        alt="alt"
      />,
    );
    // カードはアイコンのみ: アバター img の代替テキストでクレジットを表現し、名前テキストは出さない
    expect(screen.getByAltText("提供 mario335599")).toBeInTheDocument();
    expect(screen.queryByText("提供 mario335599")).toBeNull();
  });

  test("locale='en' ではアイコンの代替テキストが『by <nickname>』になる", () => {
    render(
      <StylePresetPreviewCard
        preset={makePreset({ category: PROVIDER_CATEGORY })}
        alt="alt"
        locale="en"
      />,
    );
    expect(screen.getByAltText("by mario335599")).toBeInTheDocument();
  });

  test("providerNickname が無いカテゴリではクレジットを表示しない", () => {
    render(
      <StylePresetPreviewCard
        preset={makePreset({ category: CHIBI_CATEGORY })}
        alt="alt"
      />,
    );
    expect(screen.queryByAltText(/提供|by/)).toBeNull();
  });
});

describe("StylePresetPreviewCard - 生成済み ✓ バッジ", () => {
  test("generated=true で ✓ バッジ(ラベル付き)を表示する", () => {
    render(
      <StylePresetPreviewCard
        preset={makePreset({ category: CHIBI_CATEGORY })}
        alt="alt"
        generated
        generatedLabel="生成済み"
      />,
    );
    expect(screen.getByLabelText("生成済み")).toBeInTheDocument();
  });

  test("generated=false では ✓ バッジを表示しない", () => {
    render(
      <StylePresetPreviewCard
        preset={makePreset({ category: CHIBI_CATEGORY })}
        alt="alt"
        generatedLabel="生成済み"
      />,
    );
    expect(screen.queryByLabelText("生成済み")).toBeNull();
  });

  test("dripLocked のときは generated でも ✓ バッジを出さない", () => {
    render(
      <StylePresetPreviewCard
        preset={makePreset({ category: CHIBI_CATEGORY })}
        alt="alt"
        generated
        generatedLabel="生成済み"
        dripLocked
        dripLockedLabel="あとで とうじょう"
      />,
    );
    expect(screen.queryByLabelText("生成済み")).toBeNull();
  });
});

describe("StylePresetPreviewCard - ロック表示", () => {
  test("lockedLabel を渡すとロックラベルを表示する", () => {
    render(
      <StylePresetPreviewCard
        preset={makePreset({ category: CHIBI_CATEGORY })}
        alt="alt"
        lockedLabel="ログインで生成可能！"
      />,
    );
    expect(screen.getByText("ログインで生成可能！")).toBeInTheDocument();
  });

  test("lockedLabel が無ければロックラベルを表示しない", () => {
    render(
      <StylePresetPreviewCard
        preset={makePreset({ category: CHIBI_CATEGORY })}
        alt="alt"
      />,
    );
    expect(screen.queryByText("ログインで生成可能！")).toBeNull();
  });

  test("ロック中でも選択操作 (onClick) は可能", () => {
    const onClick = jest.fn();
    render(
      <StylePresetPreviewCard
        preset={makePreset({ category: CHIBI_CATEGORY })}
        alt="alt"
        lockedLabel="ログインで生成可能！"
        onClick={onClick}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
