/** @jest-environment jsdom */

import { render, screen, fireEvent } from "@testing-library/react";
import { HashtagHighlightTextarea } from "@/features/posts/components/HashtagHighlightTextarea";
import {
  SearchAvailabilityProvider,
  SearchAvailabilityUpgrade,
} from "@/features/posts/components/SearchAvailabilityProvider";

// 入力中候補（HashtagTypeahead）経由で next-intl を読むためモックする
jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

function renderField({
  available,
  value = "",
  onChange = jest.fn(),
}: {
  available: boolean;
  value?: string;
  onChange?: (value: string) => void;
}) {
  return render(
    <SearchAvailabilityProvider>
      <HashtagHighlightTextarea
        id="caption"
        value={value}
        onChange={onChange}
        placeholder="説明"
      />
      {available ? <SearchAvailabilityUpgrade /> : null}
    </SearchAvailabilityProvider>
  );
}

describe("HashtagHighlightTextarea", () => {
  test("入力した文字はそのまま呼び出し元へ渡す", () => {
    const onChange = jest.fn();
    renderField({ available: true, onChange });

    fireEvent.change(screen.getByPlaceholderText("説明"), {
      target: { value: "#冬服 のコーデ" },
    });

    expect(onChange).toHaveBeenCalledWith("#冬服 のコーデ");
  });

  test("成立しているタグだけを青くする", () => {
    const { container } = renderField({
      available: true,
      // 「#冬服#」は X と同じくタグとして成立しない
      value: "#冬服 と #冬服#みきふく",
    });

    const highlighted = Array.from(
      container.querySelectorAll("span.text-blue-600")
    ).map((element) => element.textContent);

    expect(highlighted).toEqual(["#冬服"]);
  });

  test("段階公開中は着色しない（表示側と揃える）", () => {
    const { container } = renderField({ available: false, value: "#冬服" });

    expect(container.querySelector("span.text-blue-600")).toBeNull();
    expect(screen.getByPlaceholderText("説明")).toHaveValue("#冬服");
  });

  test("段階公開中でも入力そのものは動く", () => {
    const onChange = jest.fn();
    renderField({ available: false, onChange });

    fireEvent.change(screen.getByPlaceholderText("説明"), {
      target: { value: "ふつうの説明" },
    });

    expect(onChange).toHaveBeenCalledWith("ふつうの説明");
  });
});
