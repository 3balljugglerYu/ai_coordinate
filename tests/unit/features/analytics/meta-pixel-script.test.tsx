/**
 * Meta の Pixel の部品。
 * 動かさないページでは何も取りに行かないこと・自動の計測を止めてから init すること・
 * ページを移るたびに「ページを見た」を送ること・「登録した」を1回だけ送ることを確かめる。
 */

import { render } from "@testing-library/react";

const mockPathname = jest.fn(() => "/ja");
jest.mock("next/navigation", () => ({ usePathname: () => mockPathname() }));

import {
  META_PIXEL_SCRIPT_SRC,
  MetaPixelScript,
  resetMetaPixelForTest,
} from "@/features/analytics/components/MetaPixelScript";

const ID = "1451721257058367";
const originalLocation = window.location;

function setLocation(href: string) {
  const url = new URL(href);
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...originalLocation, href: url.href, hostname: url.hostname, origin: url.origin, pathname: url.pathname },
  });
  mockPathname.mockReturnValue(url.pathname);
}

function fbeventsTags(): HTMLScriptElement[] {
  return Array.from(document.querySelectorAll(`script[src="${META_PIXEL_SCRIPT_SRC}"]`));
}

/** fbevents.js が届く前に積まれたもの(届いたあとに、この順で送られる)。 */
function queued(): unknown[] {
  return window.fbq?.queue ?? [];
}

beforeEach(() => {
  delete window.fbq;
  delete window._fbq;
  resetMetaPixelForTest();
  document.head.innerHTML = "";
  document.cookie = "persta_ad_signup_meta=; Max-Age=0; Path=/";
});

afterEach(() => {
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  mockPathname.mockReturnValue("/ja");
});

test("本番のふつうのページでは、fbevents.js を1つ取りに行き、自動の計測を止めてから init し、ページを見たを送る", () => {
  setLocation("https://www.persta.ai/ja/campaigns/halloween-best-shot?fbclid=abc");
  render(<MetaPixelScript />);
  expect(fbeventsTags()).toHaveLength(1);
  expect(window.fbq?.disablePushState).toBe(true);
  expect(queued()).toEqual([
    ["set", "autoConfig", false, ID],
    ["init", ID],
    ["track", "PageView"],
  ]);
});

test("ページを移るたびに、ページを見たを送る(init と fbevents.js は1回だけ)", () => {
  setLocation("https://www.persta.ai/ja");
  const { rerender } = render(<MetaPixelScript />);
  setLocation("https://www.persta.ai/ja/style");
  rerender(<MetaPixelScript />);
  expect(fbeventsTags()).toHaveLength(1);
  expect(queued()).toEqual([
    ["set", "autoConfig", false, ID],
    ["init", ID],
    ["track", "PageView"],
    ["track", "PageView"],
  ]);
});

test("動かさないページ(検索)では、Meta へは何も取りに行かない", () => {
  setLocation("https://www.persta.ai/ja/search?q=secret");
  render(<MetaPixelScript />);
  expect(fbeventsTags()).toHaveLength(0);
  expect(window.fbq).toBeUndefined();
});

test("読み込んだあとに動かさないページへ移っても、そのページでは送らない", () => {
  setLocation("https://www.persta.ai/ja/style");
  const { rerender } = render(<MetaPixelScript />);
  setLocation("https://www.persta.ai/ja/my-page");
  rerender(<MetaPixelScript />);
  expect(queued().filter((c) => (c as unknown[])[1] === "PageView")).toHaveLength(1);
});

test("動かさないページから始めたときは、ほかのページへ移ったときに初めて読み込む", () => {
  setLocation("https://www.persta.ai/auth/x-complete?next=/ja/style");
  const { rerender } = render(<MetaPixelScript />);
  expect(fbeventsTags()).toHaveLength(0);
  setLocation("https://www.persta.ai/ja/style");
  rerender(<MetaPixelScript />);
  expect(fbeventsTags()).toHaveLength(1);
  expect(queued()).toContainEqual(["track", "PageView"]);
});

test("登録が終わったあと(Meta 用の印)は、CompleteRegistration を1回送って印を消す", () => {
  setLocation("https://www.persta.ai/ja/style");
  document.cookie = "persta_ad_signup_meta=1; Path=/";
  const { rerender } = render(<MetaPixelScript />);
  expect(document.cookie).not.toContain("persta_ad_signup_meta=1");
  setLocation("https://www.persta.ai/ja");
  rerender(<MetaPixelScript />);
  expect(queued().filter((c) => (c as unknown[])[1] === "CompleteRegistration")).toHaveLength(1);
});

test("ほかに fbq があるときも、fbevents.js を取りに行かず、自動の計測を止めてから init する", () => {
  const other = Object.assign(jest.fn(), { disablePushState: false });
  window.fbq = other;
  setLocation("https://www.persta.ai/ja");
  render(<MetaPixelScript />);
  expect(fbeventsTags()).toHaveLength(0);
  expect(other.disablePushState).toBe(true);
  expect(other.mock.calls).toEqual([
    ["set", "autoConfig", false, ID],
    ["init", ID],
    ["track", "PageView"],
  ]);
});

test("本番でないサイトでは、読み込まない", () => {
  setLocation("http://localhost:3000/ja");
  render(<MetaPixelScript />);
  expect(fbeventsTags()).toHaveLength(0);
  expect(window.fbq).toBeUndefined();
});

test("管理画面から開いたときは、ふつうのページへ移っても読み込まない", () => {
  setLocation("https://www.persta.ai/ja/admin");
  const { rerender } = render(<MetaPixelScript />);
  setLocation("https://www.persta.ai/ja/style");
  rerender(<MetaPixelScript />);
  expect(fbeventsTags()).toHaveLength(0);
  expect(window.fbq).toBeUndefined();
});

test("届いたあとの fbq(callMethod)には、そのまま渡す", () => {
  setLocation("https://www.persta.ai/ja");
  const { rerender } = render(<MetaPixelScript />);
  const callMethod = jest.fn();
  window.fbq!.callMethod = callMethod;
  setLocation("https://www.persta.ai/ja/style");
  rerender(<MetaPixelScript />);
  expect(callMethod).toHaveBeenCalledWith("track", "PageView");
});
