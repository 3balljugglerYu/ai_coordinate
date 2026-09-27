/** @jest-environment jsdom */

import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  CatalogTabBar,
  type CatalogTab,
} from "@/features/style-presets/components/CatalogTabBar";

/**
 * スタイルカタログの絞り込みタブ(カタログ刷新後にチップ列の代わりに出す)。
 * 下線の位置やぼかしは実際のレイアウトが要るので実機で確かめ、ここでは
 * 選択状態・押したとき・キーボード操作を見る。
 */

const TABS: CatalogTab[] = [
  { id: "all", label: "✨ すべて（新着順）" },
  { id: "popular", label: "👑 人気" },
  {
    id: "author:1",
    label: "ミク",
    icon: <span data-testid="avatar" />,
  },
];

function Harness({ onSelect }: { onSelect?: (id: string) => void }) {
  const [active, setActive] = useState("all");
  return (
    <CatalogTabBar
      tabs={TABS}
      activeId={active}
      onSelect={(id) => {
        onSelect?.(id);
        setActive(id);
      }}
      ariaLabel="スタイルを探す"
    />
  );
}

describe("CatalogTabBar", () => {
  test("タブを並べ、選択中だけ aria-selected にする", () => {
    render(<Harness />);

    const tablist = screen.getByRole("tablist", { name: "スタイルを探す" });
    expect(tablist).toBeTruthy();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "✨ すべて（新着順）",
      "👑 人気",
      "ミク",
    ]);
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual([
      "true",
      "false",
      "false",
    ]);
    // 作者タブはアイコン付き
    expect(screen.getByTestId("avatar")).toBeTruthy();
    // 選択中の下線
    expect(screen.getByTestId("catalog-tab-indicator")).toBeTruthy();
  });

  test("押したタブを選ぶ", () => {
    const onSelect = jest.fn();
    render(<Harness onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("tab", { name: "👑 人気" }));

    expect(onSelect).toHaveBeenCalledWith("popular");
    expect(
      screen.getByRole("tab", { name: "👑 人気" }).getAttribute("aria-selected")
    ).toBe("true");
  });

  test("選択中の文字は濃く、ほかはグレー(太さは同じで幅が変わらない)", () => {
    render(<Harness />);

    const active = screen.getByRole("tab", { name: "✨ すべて（新着順）" });
    const inactive = screen.getByRole("tab", { name: "👑 人気" });
    expect(active.className).toContain("text-gray-900");
    expect(inactive.className).toContain("text-gray-500");
    expect(active.className).toContain("font-bold");
    expect(inactive.className).toContain("font-bold");
  });

  test("キーボードで操作できるのは選択中のタブだけ(ほかは矢印キーで移る)", () => {
    render(<Harness />);

    expect(
      screen.getAllByRole("tab").map((tab) => tab.getAttribute("tabindex"))
    ).toEqual(["0", "-1", "-1"]);
  });

  test("矢印キー・Home・End で隣や端のタブへ移る", () => {
    const onSelect = jest.fn();
    render(<Harness onSelect={onSelect} />);
    const tablist = screen.getByRole("tablist");

    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(onSelect).toHaveBeenLastCalledWith("popular");

    fireEvent.keyDown(tablist, { key: "End" });
    expect(onSelect).toHaveBeenLastCalledWith("author:1");

    // 最後のタブより先へは進まない
    onSelect.mockClear();
    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.keyDown(tablist, { key: "ArrowLeft" });
    expect(onSelect).toHaveBeenLastCalledWith("popular");

    fireEvent.keyDown(tablist, { key: "Home" });
    expect(onSelect).toHaveBeenLastCalledWith("all");
  });

  test("右から左へ並ぶ言語では、左矢印で次のタブへ移る", () => {
    const onSelect = jest.fn();
    render(
      <div dir="rtl">
        <Harness onSelect={onSelect} />
      </div>
    );

    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowLeft" });

    expect(onSelect).toHaveBeenLastCalledWith("popular");
  });
});
