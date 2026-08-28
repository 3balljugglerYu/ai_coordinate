/** @jest-environment jsdom */

import { render, screen, fireEvent } from "@testing-library/react";
import { AdminPresetCategoryFormClient } from "@/features/preset-categories/components/AdminPresetCategoryFormClient";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));

/**
 * 企画ごとのタグ候補は「押して初めて説明文に入る」ものなので、
 * 設定できたのに投稿してもタグにならない値を保存させないことが要件。
 */
describe("カテゴリ編集のハッシュタグ候補欄", () => {
  test("入力すると保存される候補が確認できる", () => {
    render(<AdminPresetCategoryFormClient mode="create" />);

    const field = screen.getByPlaceholderText(
      "例: うちの子のオーストラリア旅行 豪州旅行"
    );
    fireEvent.change(field, {
      target: { value: "#うちの子のオーストラリア旅行, 豪州旅行" },
    });

    expect(
      screen.getByText(/#うちの子のオーストラリア旅行\s+#豪州旅行/)
    ).toBeInTheDocument();
  });

  test("タグにできない値は保存対象に出さない", () => {
    render(<AdminPresetCategoryFormClient mode="create" />);

    const field = screen.getByPlaceholderText(
      "例: うちの子のオーストラリア旅行 豪州旅行"
    );
    // 全数字はタグとして成立しない
    fireEvent.change(field, { target: { value: "123" } });

    expect(screen.queryByText(/保存される候補/)).not.toBeInTheDocument();
  });

  test("既存の設定を空白区切りで復元する", () => {
    render(
      <AdminPresetCategoryFormClient
        mode="edit"
        initial={
          {
            id: "cat-1",
            key: "travel_to_australia",
            displayNameJa: "うちの子のオーストラリア旅行",
            displayNameEn: "Australia",
            hashtagSuggestions: ["うちの子のオーストラリア旅行", "豪州旅行"],
          } as never
        }
      />
    );

    expect(
      screen.getByDisplayValue("うちの子のオーストラリア旅行 豪州旅行")
    ).toBeInTheDocument();
  });
});

describe("カテゴリ編集のワンポイントアドバイス欄", () => {
  test("日本語と英語をそれぞれ入力できる", () => {
    render(<AdminPresetCategoryFormClient mode="create" />);

    const ja = screen.getByPlaceholderText(
      "例: レンダリング品質を「バランス良く生成」にすると崩れにくいです！"
    );
    const en = screen.getByPlaceholderText(
      "e.g. Choosing Balanced quality gives more stable results!"
    );

    fireEvent.change(ja, { target: { value: "崩れにくいです" } });
    fireEvent.change(en, { target: { value: "More stable" } });

    expect(ja).toHaveValue("崩れにくいです");
    expect(en).toHaveValue("More stable");
  });

  test("既存の設定を復元する", () => {
    render(
      <AdminPresetCategoryFormClient
        mode="edit"
        initial={
          {
            id: "cat-1",
            key: "travel_to_australia",
            displayNameJa: "うちの子のオーストラリア旅行",
            displayNameEn: "Australia",
            generationTipJa: "保存済みのヒント",
          } as never
        }
      />
    );

    expect(screen.getByDisplayValue("保存済みのヒント")).toBeInTheDocument();
  });
});

