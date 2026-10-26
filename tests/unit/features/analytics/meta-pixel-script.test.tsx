/**
 * Meta の Pixel の部品と、ブラウザで動く読み込みの文。
 * 送るその瞬間の URL で確かめること・自動の計測を止めること・1回だけ送ることを確かめる。
 */

import { render } from "@testing-library/react";

const mockPathname = jest.fn(() => "/ja");
jest.mock("next/navigation", () => ({ usePathname: () => mockPathname() }));
jest.mock("next/script", () => ({
  __esModule: true,
  default: ({ id, children }: { id: string; children: string }) => <script data-testid={id}>{children}</script>,
}));

import { buildMetaPixelInlineScript, MetaPixelScript } from "@/features/analytics/components/MetaPixelScript";
import { isMetaPixelLoadableLocation } from "@/features/analytics/lib/ad-pixels";

const originalLocation = window.location;

function setLocation(href: string, referrer = "") {
  const url = new URL(href);
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...originalLocation, href: url.href, hostname: url.hostname, origin: url.origin, pathname: url.pathname },
  });
  Object.defineProperty(document, "referrer", { configurable: true, value: referrer });
  mockPathname.mockReturnValue(url.pathname);
}

type FbqMock = jest.Mock & { disablePushState?: boolean };
type FbqWindow = Window & { fbq?: FbqMock; _fbq?: unknown };
const w = window as FbqWindow;

/** ブラウザで動く読み込みの文を、そのまま動かす(fbevents.js の取りに行く先は差し替える)。 */
function runInlineScript() {
  document.head.innerHTML = '<script id="anchor"></script>';
  new Function(buildMetaPixelInlineScript())();
}

function fbeventsTag(): HTMLScriptElement | null {
  return document.querySelector('script[src="https://connect.facebook.net/en_US/fbevents.js"]');
}

/** fbevents.js が届いたことにする(本物の fbq に差し替えてから onload を呼ぶ)。 */
function finishLoading(): FbqMock {
  const real = jest.fn() as FbqMock;
  const stub = w.fbq as FbqMock;
  real.disablePushState = stub.disablePushState;
  w.fbq = real;
  const tag = fbeventsTag();
  tag?.onload?.(new Event("load"));
  return real;
}

beforeEach(() => {
  delete (window as unknown as { fbq?: unknown }).fbq;
  delete (window as unknown as { _fbq?: unknown })._fbq;
  delete window.__perstaMetaPixelTry;
  document.cookie = "persta_ad_signup_meta=; Max-Age=0; Path=/";
});

afterEach(() => {
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  Object.defineProperty(document, "referrer", { configurable: true, value: "" });
  mockPathname.mockReturnValue("/ja");
});

describe("読み込みの文(ブラウザで動く)", () => {
  test("きれいなページでは fbevents.js を取りに行き、届いたら自動の計測を止めてから init し、ページを見たを1回送る", () => {
    setLocation("https://www.persta.ai/ja/campaigns/halloween-best-shot?fbclid=abc");
    runInlineScript();
    expect(fbeventsTag()).not.toBeNull();
    expect(w.fbq?.disablePushState).toBe(true);
    const fbq = finishLoading();
    expect(fbq.mock.calls).toEqual([
      ["set", "autoConfig", false, "1451721257058367"],
      ["init", "1451721257058367"],
      ["track", "PageView"],
    ]);
    expect(fbq.disablePushState).toBe(true);
    // もう一度試しても、送らない(1回の訪問で1回)
    window.__perstaMetaPixelTry?.();
    expect(fbq).toHaveBeenCalledTimes(3);
  });

  test("きれいでないページでは、Meta へは何も取りに行かない", () => {
    setLocation("https://www.persta.ai/ja/posts/123");
    runInlineScript();
    expect(fbeventsTag()).toBeNull();
    expect(w.fbq).toBeUndefined();
  });

  test("取りに行っている間にきれいでないページへ移ったら、届いても送らず、きれいなページへ戻ったときに送る", () => {
    setLocation("https://www.persta.ai/ja");
    runInlineScript();
    setLocation("https://www.persta.ai/ja/search?q=secret");
    const fbq = finishLoading();
    expect(fbq).not.toHaveBeenCalled();
    setLocation("https://www.persta.ai/ja/style");
    window.__perstaMetaPixelTry?.();
    expect(fbq).toHaveBeenCalledWith("track", "PageView");
  });

  test("登録が終わったあと(Meta 用の印)は、CompleteRegistration を送って印を消す", () => {
    setLocation("https://www.persta.ai/ja/style");
    document.cookie = "persta_ad_signup_meta=1; Path=/";
    runInlineScript();
    const fbq = finishLoading();
    expect(fbq).toHaveBeenLastCalledWith("track", "CompleteRegistration");
    expect(document.cookie).not.toContain("persta_ad_signup_meta=1");
  });

  test.each([
    ["https://www.persta.ai/ja", ""],
    ["https://www.persta.ai/ja/", ""],
    ["https://www.persta.ai/zh-CN/catalog/halloween", ""],
    ["https://www.persta.ai/ja/campaigns/x?fbclid=a&utm_source=meta&igsh=b&ad_id=1", "https://l.facebook.com/"],
    ["https://www.persta.ai/ja/style", "https://www.persta.ai/ja/campaigns/x?utm_campaign=y"],
    ["https://www.persta.ai/ja/posts/123", ""],
    ["https://www.persta.ai/ja/catalog/halloween/p/1", ""],
    ["https://www.persta.ai/ja/style?q=secret", ""],
    ["https://www.persta.ai/ja/campaigns/x?ref=CODE", ""],
    ["https://www.persta.ai/ja/style#access_token=abc", ""],
    ["https://www.persta.ai/auth/x-complete?next=/ja/style", ""],
    ["https://www.persta.ai/ja/style", "https://www.persta.ai/ja/search?q=secret"],
    ["https://www.persta.ai//ja//style", ""],
  ])("サーバーの決まりと同じ結果になる: %s(来る前 %j)", (href, referrer) => {
    setLocation(href, referrer);
    runInlineScript();
    expect(fbeventsTag() !== null).toBe(isMetaPixelLoadableLocation(href, referrer));
  });
});

describe("部品", () => {
  test("本番のサイトでは、読み込みの文を出す", () => {
    setLocation("https://www.persta.ai/ja/posts/123");
    const { getByTestId } = render(<MetaPixelScript />);
    expect(getByTestId("meta-pixel").textContent).toContain("__perstaMetaPixelTry");
  });

  test("本番でないサイトでは出さない", () => {
    setLocation("http://localhost:3000/ja");
    const { queryByTestId } = render(<MetaPixelScript />);
    expect(queryByTestId("meta-pixel")).toBeNull();
  });

  test("管理画面から開いたときは、ふつうのページへ移っても出さない", () => {
    setLocation("https://www.persta.ai/ja/admin");
    const { queryByTestId, rerender } = render(<MetaPixelScript />);
    setLocation("https://www.persta.ai/ja/style");
    rerender(<MetaPixelScript />);
    expect(queryByTestId("meta-pixel")).toBeNull();
  });

  test("ページを移ったあとに、もう一度試す", () => {
    setLocation("https://www.persta.ai/ja/posts/1");
    const tryMock = jest.fn();
    window.__perstaMetaPixelTry = tryMock;
    const { rerender } = render(<MetaPixelScript />);
    const before = tryMock.mock.calls.length;
    setLocation("https://www.persta.ai/ja/style");
    rerender(<MetaPixelScript />);
    expect(tryMock.mock.calls.length).toBe(before + 1);
  });

  test("埋める決まりに </script> を閉じる文字が出ない", () => {
    expect(buildMetaPixelInlineScript()).not.toMatch(/<\/script/i);
  });
});
