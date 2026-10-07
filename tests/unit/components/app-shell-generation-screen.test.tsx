/** @jest-environment jsdom */

/**
 * スマホの生成画面(/generate/...)は、投稿フォームと同じく共通の枠(ヘッダー・ナビ・フッター)を出さない。
 */
import React from "react";
import { render, screen } from "@testing-library/react";

const pathnameMock = jest.fn(() => "/");
jest.mock("next/navigation", () => ({ usePathname: () => pathnameMock() }));
jest.mock("@/components/NavigationBar", () => ({ NavigationBar: () => <div data-testid="nav" /> }));
jest.mock("@/components/MobileTypingTracker", () => ({ MobileTypingTracker: () => <div data-testid="typing" /> }));
jest.mock("@/components/Footer", () => ({ Footer: () => <div data-testid="footer" /> }));
jest.mock("@/features/posts/components/StickyHeader", () => ({ StickyHeader: () => <div data-testid="header" /> }));
jest.mock("@/components/AppSidebar", () => ({ AppSidebar: () => <div data-testid="sidebar" /> }));
jest.mock("@/components/CollectionProgressChecker", () => ({ CollectionProgressChecker: () => <div data-testid="x1" /> }));
jest.mock("@/features/collections/components/CollectionUnlockDripListener", () => ({
  CollectionUnlockDripListener: () => <div data-testid="x2" />,
}));
jest.mock("@/features/notifications/components/BonusNotificationToastListener", () => ({
  BonusNotificationToastListener: () => <div data-testid="x3" />,
}));
jest.mock("@/features/tutorial/components/TutorialTourProvider", () => ({ TutorialTourProvider: () => <div data-testid="x4" /> }));
jest.mock("@/features/auth/components/SignupSourceCapture", () => ({ SignupSourceCapture: () => <div data-testid="signup" /> }));

import { AppShell } from "@/components/AppShell";

test.each([
  ["/generate/post/abc", true],
  ["/en/generate/style/preset-1", true],
  ["/generate/post/abc/extra", false],
  ["/generate", false],
  ["/posts/abc", false],
])("%s で共通の枠を隠す=%s", (path, hidden) => {
  pathnameMock.mockReturnValue(path);
  render(
    <AppShell>
      <p data-testid="page" />
    </AppShell>,
  );
  expect(screen.getByTestId("page")).toBeTruthy();
  expect(screen.queryByTestId("header") === null).toBe(hidden);
  expect(screen.queryByTestId("nav") === null).toBe(hidden);
});
