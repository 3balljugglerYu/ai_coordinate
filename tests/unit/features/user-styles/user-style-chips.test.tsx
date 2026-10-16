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

/*
  🎃 開催中のハッシュタグ企画のタブ(2026-10-16 ユーザー指示)。「すべて(新着順)」のすぐ右に置く。
  一覧の横スワイプの並び(userStyleChipIds)も同じ順にする。
*/
describe("UserStyleChips(ハッシュタグ企画のタブ)", () => {
  const CAMPAIGN_TAB = { id: "campaign:halloween-best-shot" as const, label: "🎃 #うちの子のベストショット" };

  test.each([
    ["刷新後", true],
    ["刷新前", false],
  ])("%s: 「すべて」のすぐ右に出し、押すと企画のタブを選ぶ", (_label, revamp) => {
    catalogRevampMock.mockReturnValue(revamp);
    const onSelect = jest.fn();
    render(
      <UserStyleChips
        active="campaign:halloween-best-shot"
        authors={AUTHORS}
        campaignTab={CAMPAIGN_TAB}
        onSelect={onSelect}
      />
    );

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "✨ userStyles.chipAll",
      "🎃 #うちの子のベストショット",
      "💖 userStyles.chipUsage",
      "ミク",
      "リン",
    ]);
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");

    fireEvent.click(screen.getByRole("tab", { name: "✨ userStyles.chipAll" }));
    expect(onSelect).toHaveBeenCalledWith("all");
  });

  test("開催中でなければ(null)出さない", () => {
    catalogRevampMock.mockReturnValue(true);
    render(<UserStyleChips active="all" authors={[]} campaignTab={null} onSelect={jest.fn()} />);
    expect(screen.queryByRole("tab", { name: /うちの子のベストショット/ })).toBeNull();
  });

  test("並び(userStyleChipIds)も「すべて」のすぐ右", () => {
    expect(userStyleChipIds(AUTHORS, "campaign:halloween-best-shot")).toEqual([
      "all",
      "campaign:halloween-best-shot",
      "usage",
      "author:author-1",
      "author:author-2",
    ]);
    // 企画が無ければこれまでどおり
    expect(userStyleChipIds(AUTHORS, null)).toEqual(userStyleChipIds(AUTHORS));
  });
});
