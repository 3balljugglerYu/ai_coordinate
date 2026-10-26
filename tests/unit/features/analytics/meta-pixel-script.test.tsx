/**
 * Meta の Pixel の部品。本番のサイトで、きれいな URL のページのときだけ、読み込みのタグを出す。
 */

import { render } from "@testing-library/react";

const mockPathname = jest.fn(() => "/ja");
jest.mock("next/navigation", () => ({ usePathname: () => mockPathname() }));
jest.mock("next/script", () => ({
  __esModule: true,
  default: ({ id, children }: { id: string; children: string }) => <script data-testid={id}>{children}</script>,
}));

import { MetaPixelScript } from "@/features/analytics/components/MetaPixelScript";

const originalLocation = window.location;

function setLocation(href: string) {
  const url = new URL(href);
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...originalLocation, href: url.href, hostname: url.hostname, origin: url.origin, pathname: url.pathname },
  });
  mockPathname.mockReturnValue(url.pathname);
}

afterEach(() => {
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  mockPathname.mockReturnValue("/ja");
});

test("本番のきれいなページでは、自動の計測を止めてから init し、ページを見たを1回送る", () => {
  setLocation("https://www.persta.ai/ja/campaigns/halloween-best-shot?fbclid=abc");
  const { getByTestId } = render(<MetaPixelScript />);
  const text = getByTestId("meta-pixel").textContent ?? "";
  const initAt = text.indexOf("fbq('init','1623101996277700')");
  expect(initAt).toBeGreaterThan(-1);
  expect(text.indexOf("fbq.disablePushState=true")).toBeLessThan(initAt);
  expect(text.indexOf("fbq('set','autoConfig',false,'1623101996277700')")).toBeLessThan(initAt);
  expect(text.indexOf("fbq('track','PageView')")).toBeGreaterThan(initAt);
  expect(text).toContain("https://connect.facebook.net/en_US/fbevents.js");
});

test("登録が終わったあと(Meta 用の印)は、CompleteRegistration を送って印を消す", () => {
  setLocation("https://www.persta.ai/ja/style");
  const { getByTestId } = render(<MetaPixelScript />);
  const text = getByTestId("meta-pixel").textContent ?? "";
  expect(text).toContain("indexOf('persta_ad_signup_meta=1')");
  expect(text.indexOf("fbq('track','CompleteRegistration')")).toBeGreaterThan(text.indexOf("fbq('track','PageView')"));
  expect(text).toContain("document.cookie='persta_ad_signup_meta=; Max-Age=0; Path=/; SameSite=Lax; Secure'");
});

test.each([
  "https://www.persta.ai/ja/posts/123",
  "https://www.persta.ai/ja/search?q=secret",
  "https://www.persta.ai/auth/x-complete?next=/ja/style",
  "http://localhost:3000/ja",
])("%s では読み込まない", (href) => {
  setLocation(href);
  const { queryByTestId } = render(<MetaPixelScript />);
  expect(queryByTestId("meta-pixel")).toBeNull();
});

test("きれいでないページから開いても、きれいなページへ移ったら読み込む(Google・X のログインの完了の画面から移ったときなど)", () => {
  setLocation("https://www.persta.ai/auth/x-complete?next=/ja/style");
  const { queryByTestId, rerender } = render(<MetaPixelScript />);
  expect(queryByTestId("meta-pixel")).toBeNull();
  setLocation("https://www.persta.ai/ja/style");
  rerender(<MetaPixelScript />);
  expect(queryByTestId("meta-pixel")).not.toBeNull();
});

test("管理画面から開いたときは、きれいなページへ移っても読み込まない", () => {
  setLocation("https://www.persta.ai/ja/admin");
  const { queryByTestId, rerender } = render(<MetaPixelScript />);
  setLocation("https://www.persta.ai/ja/style");
  rerender(<MetaPixelScript />);
  expect(queryByTestId("meta-pixel")).toBeNull();
});
