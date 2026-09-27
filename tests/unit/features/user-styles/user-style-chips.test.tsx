/** @jest-environment jsdom */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { UserStyleChips } from "@/features/user-styles/components/UserStyleChips";
import { userStyleChipIds } from "@/features/user-styles/lib/user-style-chip-ids";
import type { UserStyleAuthor } from "@/features/user-styles/types";

/**
 * /user-styles の絞り込み。カタログ刷新(段階公開中は運営のみ)ではタブにする。
 * タブの並びと、一覧の横スワイプで隣を決める並び(userStyleChipIds)は同じでなければならない。
 */

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ alt, src }: { alt: string; src: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} data-testid="author-avatar" />
  ),
}));

jest.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

const catalogRevampMock = jest.fn(() => false);
jest.mock("@/features/style-presets/hooks/useStylesCatalogRevamp", () => ({
  useStylesCatalogRevamp: () => catalogRevampMock(),
}));

const AUTHORS: UserStyleAuthor[] = [
  {
    authorId: "author-1",
    nickname: "ミク",
    avatarUrl: "https://example.com/a.webp",
    latestPostedAt: "2026-09-18T00:00:00Z",
  },
  {
    authorId: "author-2",
    nickname: "リン",
    avatarUrl: null,
    latestPostedAt: "2026-09-17T00:00:00Z",
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  catalogRevampMock.mockReturnValue(false);
});

describe("UserStyleChips", () => {
  test("刷新前: これまでどおりのチップ(下線は無い)", () => {
    render(<UserStyleChips active="all" authors={AUTHORS} onSelect={jest.fn()} />);

    expect(
      screen.getByRole("tab", { name: "✨ userStyles.chipAll" }).className
    ).toContain("rounded-full");
    expect(screen.queryByTestId("catalog-tab-indicator")).toBeNull();
  });

  test("刷新後: タブにし、作者はアイコン付きで後ろに並べる", () => {
    catalogRevampMock.mockReturnValue(true);
    render(<UserStyleChips active="usage" authors={AUTHORS} onSelect={jest.fn()} />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "✨ userStyles.chipAll",
      "💖 userStyles.chipUsage",
      "ミク",
      "リン",
    ]);
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual([
      "false",
      "true",
      "false",
      "false",
    ]);
    expect(screen.getByTestId("catalog-tab-indicator")).toBeTruthy();
    expect(screen.getByTestId("author-avatar")).toBeTruthy();
    // スクロールで上端に固定する帯の中
    expect(screen.getByTestId("styles-catalog-chip-bar")).toBeTruthy();
  });

  test("刷新後: 押したタブ(作者も)を選ぶ", () => {
    catalogRevampMock.mockReturnValue(true);
    const onSelect = jest.fn();
    render(<UserStyleChips active="all" authors={AUTHORS} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("tab", { name: "リン" }));

    expect(onSelect).toHaveBeenCalledWith("author:author-2");
  });
});

describe("userStyleChipIds", () => {
  test("タブと同じ並び(すべて → みんなが使ってる → 作者)を返す", () => {
    expect(userStyleChipIds(AUTHORS)).toEqual([
      "all",
      "usage",
      "author:author-1",
      "author:author-2",
    ]);
    expect(userStyleChipIds([])).toEqual(["all", "usage"]);
  });
});
