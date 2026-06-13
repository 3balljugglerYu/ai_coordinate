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
