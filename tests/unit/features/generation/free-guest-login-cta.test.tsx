/** @jest-environment jsdom */

/**
 * Free Style（/free）を未ログインで開いたときのログインの案内。
 *
 * ⭐ 一般の利用者には今の見出し（free.loginCtaTitle「Free Style はログインが必要です」）を出す。
 * カタログ刷新（公開前は運営だけ）では /free は「カタログをつくる（CREATE）」のタブなので、
 * 見出しを「CREATE はログインが必要です」（free.loginCtaTitleCreate）にする
 * （2026-09-29 ユーザー指示）。
 */

import React from "react";
import { render, screen } from "@testing-library/react";

jest.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
jest.mock("@/lib/build-current-url", () => ({
  useCurrentUrlForRedirect: () => "/ja/free",
}));
const mockRevamp = jest.fn<boolean, []>();
jest.mock("@/features/style-presets/hooks/useStylesCatalogRevamp", () => ({
  useStylesCatalogRevamp: () => mockRevamp(),
}));

import { FreeGuestLoginCta } from "@/features/generation/components/FreeGuestLoginCta";

describe("FreeGuestLoginCta", () => {
  test("一般の利用者には今の見出し（Free Style はログインが必要です）を出す", () => {
    mockRevamp.mockReturnValue(false);
    render(<FreeGuestLoginCta />);

    expect(screen.getByText("free.loginCtaTitle")).toBeTruthy();
    expect(screen.queryByText("free.loginCtaTitleCreate")).toBeNull();
  });

  test("刷新後は「CREATE はログインが必要です」にする", () => {
    mockRevamp.mockReturnValue(true);
    render(<FreeGuestLoginCta />);

    expect(screen.getByText("free.loginCtaTitleCreate")).toBeTruthy();
    expect(screen.queryByText("free.loginCtaTitle")).toBeNull();
  });

  test.each([false, true])("刷新=%s でも、説明とログインの導線は同じ", (revamp) => {
    mockRevamp.mockReturnValue(revamp);
    render(<FreeGuestLoginCta />);

    expect(screen.getByText("free.loginCtaDescription")).toBeTruthy();
    expect(screen.getByText("free.loginCtaAction").closest("a")?.getAttribute("href")).toBe(
      `/login?redirect=${encodeURIComponent("/ja/free")}`
    );
  });
});
