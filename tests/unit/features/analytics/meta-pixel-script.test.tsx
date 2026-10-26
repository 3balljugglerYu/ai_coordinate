/**
 * Meta の Pixel の部品。
 * 動かさないページでは何も取りに行かないこと・fbevents.js が届いてから、その時点のページで確かめて送ること・
 * 自動の計測を止めてから init すること・ページを移るたびに「ページを見た」を送ること・
 * 「登録した」を1回だけ送り、届いたあとに印を消すことを確かめる。
 */

import { render } from "@testing-library/react";

const mockPathname = jest.fn(() => "/ja");
jest.mock("next/navigation", () => ({ usePathname: () => mockPathname() }));

import { META_PIXEL_SCRIPT_SRC, MetaPixelScript } from "@/features/analytics/components/MetaPixelScript";

const ID = "1451721257058367";
const originalLocation = window.location;

function setLocation(href: string, referrer?: string) {
  const url = new URL(href);
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...originalLocation, href: url.href, hostname: url.hostname, origin: url.origin, pathname: url.pathname },
  });
  if (referrer !== undefined) {
    Object.defineProperty(document, "referrer", { configurable: true, value: referrer });
  }
  mockPathname.mockReturnValue(url.pathname);
}

function fbeventsTags(): HTMLScriptElement[] {
  return Array.from(document.querySelectorAll(`script[src="${META_PIXEL_SCRIPT_SRC}"]`));
}

/** fbq に積まれたもの(fbevents.js が、この順で送る)。 */
function queued(): unknown[][] {
  return (window.fbq?.queue ?? []) as unknown[][];
}

function tracked(name: string): number {
  return queued().filter((c) => c[0] === "track" && c[1] === name).length;
}

/** fbevents.js が届いたことにする。 */
function finishLoading() {
  fbeventsTags()[0]?.onload?.(new Event("load"));
}

beforeEach(() => {
  delete window.fbq;
  delete window._fbq;
  delete window.__perstaMetaPixel;
  document.head.innerHTML = "";
  document.cookie = "persta_ad_signup_meta=; Max-Age=0; Path=/";
  Object.defineProperty(document, "referrer", { configurable: true, value: "" });
});

afterEach(() => {
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  Object.defineProperty(document, "referrer", { configurable: true, value: "" });
  mockPathname.mockReturnValue("/ja");
});

test("ふつうのページでは fbevents.js を1つ取りに行き、届くまでは何も積まない。届いたら自動の計測を止めてから init し、ページを見たを送る", () => {
  setLocation("https://www.persta.ai/ja/campaigns/halloween-best-shot?fbclid=abc");
  render(<MetaPixelScript />);
  expect(fbeventsTags()).toHaveLength(1);
  expect(window.fbq?.disablePushState).toBe(true);
  expect(queued()).toEqual([]);
  finishLoading();
  expect(queued()).toEqual([
    ["set", "autoConfig", false, ID],
    ["init", ID],
    ["track", "PageView"],
  ]);
});

test("届く前に動かさないページへ移ったら、届いても init だけで、ページを見たは送らない。ふつうのページへ戻ったときに送る", () => {
  setLocation("https://www.persta.ai/ja");
  const { rerender } = render(<MetaPixelScript />);
  setLocation("https://www.persta.ai/ja/search");
  rerender(<MetaPixelScript />);
  finishLoading();
  expect(queued()).toEqual([
    ["set", "autoConfig", false, ID],
    ["init", ID],
  ]);
  setLocation("https://www.persta.ai/ja/style");
  rerender(<MetaPixelScript />);
  expect(tracked("PageView")).toBe(1);
});

test("届いたあとは、ページを移るたびにページを見たを送る(init と fbevents.js は1回だけ)", () => {
  setLocation("https://www.persta.ai/ja");
  const { rerender } = render(<MetaPixelScript />);
  finishLoading();
  setLocation("https://www.persta.ai/ja/style");
  rerender(<MetaPixelScript />);
  expect(fbeventsTags()).toHaveLength(1);
  expect(queued().filter((c) => c[0] === "init")).toHaveLength(1);
  expect(tracked("PageView")).toBe(2);
});

test("動かさないページ(検索)では、Meta へは何も取りに行かない", () => {
  setLocation("https://www.persta.ai/ja/search?q=secret");
  render(<MetaPixelScript />);
  expect(fbeventsTags()).toHaveLength(0);
  expect(window.fbq).toBeUndefined();
});

test("届いたあとに動かさないページへ移っても、そのページでは送らない", () => {
  setLocation("https://www.persta.ai/ja/style");
  const { rerender } = render(<MetaPixelScript />);
  finishLoading();
  setLocation("https://www.persta.ai/ja/my-page");
  rerender(<MetaPixelScript />);
  expect(tracked("PageView")).toBe(1);
});

test("動かさないページから始めたときは、ほかのページへ移ったときに初めて読み込む", () => {
  setLocation("https://www.persta.ai/auth/x-complete?next=/ja/style");
  const { rerender } = render(<MetaPixelScript />);
  expect(fbeventsTags()).toHaveLength(0);
  setLocation("https://www.persta.ai/ja/style");
  rerender(<MetaPixelScript />);
  finishLoading();
  expect(tracked("PageView")).toBe(1);
});

test.each(["https://www.persta.ai/ja/search?q=secret", "https://www.persta.ai/m/token123"])(
  "来る前のページがこのサイトの動かさないページ(%s)のタブでは、読み込まない",
  (referrer) => {
    setLocation("https://www.persta.ai/ja/posts/123", referrer);
    const { rerender } = render(<MetaPixelScript />);
    setLocation("https://www.persta.ai/ja/style");
    rerender(<MetaPixelScript />);
    expect(fbeventsTags()).toHaveLength(0);
    expect(window.fbq).toBeUndefined();
  },
);

test("ほかのサイトから来たとき・このサイトのふつうのページから来たときは読み込む", () => {
  setLocation("https://www.persta.ai/ja/style", "https://l.facebook.com/");
  render(<MetaPixelScript />);
  expect(fbeventsTags()).toHaveLength(1);
  delete window.__perstaMetaPixel;
  delete window.fbq;
  document.head.innerHTML = "";
  setLocation("https://www.persta.ai/ja/campaigns/x", "https://www.persta.ai/ja");
  render(<MetaPixelScript />);
  expect(fbeventsTags()).toHaveLength(1);
});

test("登録が終わったあと(Meta 用の印)は、届いたあとに CompleteRegistration を1回送って印を消す", () => {
  setLocation("https://www.persta.ai/ja/style");
  document.cookie = "persta_ad_signup_meta=1; Path=/";
  const { rerender } = render(<MetaPixelScript />);
  // 届く前は、印を残す(届かなかったときに、あとで送れるように)
  expect(document.cookie).toContain("persta_ad_signup_meta=1");
  finishLoading();
  expect(document.cookie).not.toContain("persta_ad_signup_meta=1");
  setLocation("https://www.persta.ai/ja");
  rerender(<MetaPixelScript />);
  expect(tracked("CompleteRegistration")).toBe(1);
});

test("fbevents.js が届かないあいだは、印を消さない", () => {
  setLocation("https://www.persta.ai/ja/style");
  document.cookie = "persta_ad_signup_meta=1; Path=/";
  const { rerender } = render(<MetaPixelScript />);
  setLocation("https://www.persta.ai/ja");
  rerender(<MetaPixelScript />);
  expect(document.cookie).toContain("persta_ad_signup_meta=1");
  expect(queued()).toEqual([]);
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

test("部品を作り直しても(同じタブ)、init と fbevents.js は1回だけ", () => {
  setLocation("https://www.persta.ai/ja");
  const first = render(<MetaPixelScript />);
  finishLoading();
  first.unmount();
  setLocation("https://www.persta.ai/ja/style");
  render(<MetaPixelScript />);
  expect(fbeventsTags()).toHaveLength(1);
  expect(queued().filter((c) => c[0] === "init")).toHaveLength(1);
  expect(tracked("PageView")).toBe(2);
});

test("本番でないサイトでは、読み込まない", () => {
  setLocation("http://localhost:3000/ja");
  render(<MetaPixelScript />);
  expect(fbeventsTags()).toHaveLength(0);
  expect(window.fbq).toBeUndefined();
});

test.each(["https://www.persta.ai/ja/admin", "https://www.persta.ai//ja//admin"])(
  "管理画面(%s)から開いたときは、ふつうのページへ移っても読み込まない",
  (href) => {
    setLocation(href);
    const { rerender } = render(<MetaPixelScript />);
    setLocation("https://www.persta.ai/ja/style");
    rerender(<MetaPixelScript />);
    expect(fbeventsTags()).toHaveLength(0);
    expect(window.fbq).toBeUndefined();
  },
);

test("届いたあとの fbq(callMethod)には、そのまま渡す", () => {
  setLocation("https://www.persta.ai/ja");
  const { rerender } = render(<MetaPixelScript />);
  finishLoading();
  const callMethod = jest.fn();
  window.fbq!.callMethod = callMethod;
  setLocation("https://www.persta.ai/ja/style");
  rerender(<MetaPixelScript />);
  expect(callMethod).toHaveBeenCalledWith("track", "PageView");
});
