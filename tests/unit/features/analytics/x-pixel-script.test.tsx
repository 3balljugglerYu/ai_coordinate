/**
 * X の Pixel の部品。本番のサイトで、外さないページのときだけ、読み込みのタグを出す。
 */

import { render } from "@testing-library/react";

const mockPathname = jest.fn(() => "/ja");
jest.mock("next/navigation", () => ({ usePathname: () => mockPathname() }));
jest.mock("next/script", () => ({
  __esModule: true,
  default: ({ id, children }: { id: string; children: string }) => (
    <script data-testid={id}>{children}</script>
  ),
}));

import { XPixelScript } from "@/features/analytics/components/XPixelScript";

const originalLocation = window.location;

function setHostname(hostname: string) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...originalLocation, hostname, origin: `https://${hostname}` },
  });
}

afterEach(() => {
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  mockPathname.mockReturnValue("/ja");
  delete window.twq;
});

test("本番のサイトでは、ID つきの読み込みのタグを出す", () => {
  setHostname("www.persta.ai");
  const { getByTestId } = render(<XPixelScript />);
  const script = getByTestId("x-pixel");
  expect(script.textContent).toContain("twq('config','r9ypz')");
  expect(script.textContent).toContain("https://static.ads-twitter.com/uwt.js");
});

test("自動の計測4つを、config より前に止める", () => {
  setHostname("www.persta.ai");
  const { getByTestId } = render(<XPixelScript />);
  const text = getByTestId("x-pixel").textContent ?? "";
  const configAt = text.indexOf("twq('config','r9ypz')");
  for (const name of ["autoConfig", "autoAdvancedMatching", "dataLayerTracking", "autoDwellTracking"]) {
    const at = text.indexOf(`twq('set','${name}','false','r9ypz')`);
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(configAt);
  }
});

test("本番でないサイト(開発・プレビュー)では出さない", () => {
  setHostname("localhost");
  const { queryByTestId } = render(<XPixelScript />);
  expect(queryByTestId("x-pixel")).toBeNull();
});

test("管理画面から開いたときは出さない", () => {
  setHostname("www.persta.ai");
  mockPathname.mockReturnValue("/ja/admin");
  const { queryByTestId } = render(<XPixelScript />);
  expect(queryByTestId("x-pixel")).toBeNull();
});

test("管理画面からふつうのページへ移ったら、そこで読み込む", () => {
  setHostname("www.persta.ai");
  mockPathname.mockReturnValue("/ja/admin");
  const { queryByTestId, rerender } = render(<XPixelScript />);
  expect(queryByTestId("x-pixel")).toBeNull();
  mockPathname.mockReturnValue("/ja/style");
  rerender(<XPixelScript />);
  expect(queryByTestId("x-pixel")).not.toBeNull();
});

test("送る URL を、config より前に、ドメインとページの場所だけに決める", () => {
  setHostname("www.persta.ai");
  mockPathname.mockReturnValue("/ja/style");
  const { getByTestId } = render(<XPixelScript />);
  const text = getByTestId("x-pixel").textContent ?? "";
  const setAt = text.indexOf(`twq('set',{"page_location":"https://www.persta.ai/ja/style"})`);
  expect(setAt).toBeGreaterThan(-1);
  expect(setAt).toBeLessThan(text.indexOf("twq('config','r9ypz')"));
});

test("URL に </script> が入っても、タグを閉じる文字のまま埋めない", () => {
  setHostname("www.persta.ai");
  mockPathname.mockReturnValue("/ja/posts/</script><img src=x>");
  const { getByTestId } = render(<XPixelScript />);
  const text = getByTestId("x-pixel").textContent ?? "";
  expect(text).not.toContain("</script>");
  expect(text).toContain("\\u003c/script\\u003e");
});

test("読み込んだあと、ページを移るたびに送る URL を置き換え、外すページではサイトの最初のページにする", () => {
  setHostname("www.persta.ai");
  const twq = jest.fn();
  window.twq = twq;
  mockPathname.mockReturnValue("/ja/style");
  const { rerender } = render(<XPixelScript />);
  expect(twq).toHaveBeenLastCalledWith("set", { page_location: "https://www.persta.ai/ja/style" });
  mockPathname.mockReturnValue("/ja/search");
  rerender(<XPixelScript />);
  expect(twq).toHaveBeenLastCalledWith("set", { page_location: "https://www.persta.ai/" });
});

test("本番でないサイトでは、送る URL も置き換えない", () => {
  setHostname("localhost");
  const twq = jest.fn();
  window.twq = twq;
  render(<XPixelScript />);
  expect(twq).not.toHaveBeenCalled();
});

