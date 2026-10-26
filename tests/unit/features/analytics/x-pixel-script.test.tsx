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

test("管理画面から開いたときは、ふつうのページへ移っても読み込まない(画面の中の移動では送らない)", () => {
  setHostname("www.persta.ai");
  mockPathname.mockReturnValue("/ja/admin");
  const { queryByTestId, rerender } = render(<XPixelScript />);
  expect(queryByTestId("x-pixel")).toBeNull();
  mockPathname.mockReturnValue("/ja/style");
  rerender(<XPixelScript />);
  expect(queryByTestId("x-pixel")).toBeNull();
});

test("ふつうのページから開いたあと、管理画面へ移っても、読み込みのタグは出したまま(もう一度は動かない)", () => {
  setHostname("www.persta.ai");
  mockPathname.mockReturnValue("/ja/style");
  const { queryByTestId, rerender } = render(<XPixelScript />);
  expect(queryByTestId("x-pixel")).not.toBeNull();
  mockPathname.mockReturnValue("/ja/admin");
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

test("URL に < や > が入っても、そのまま埋めない(</script> でタグを閉じさせない)", () => {
  setHostname("www.persta.ai");
  mockPathname.mockReturnValue("/ja/campaigns/<script>alert(1)");
  const { getByTestId } = render(<XPixelScript />);
  const text = getByTestId("x-pixel").textContent ?? "";
  expect(text).not.toContain("<script>");
  expect(text).toContain("\\u003cscript\\u003e");
});

test("場所に ID が入るページでは、URL を送らない(hide_page_location)", () => {
  setHostname("www.persta.ai");
  mockPathname.mockReturnValue("/ja/m/secret-token");
  const { getByTestId } = render(<XPixelScript />);
  const text = getByTestId("x-pixel").textContent ?? "";
  expect(text).toContain(`twq('set',{"hide_page_location":true})`);
  expect(text).not.toContain("secret-token");
});

test("登録のページが広告の行き先でも読み込む(URL は送らない)", () => {
  setHostname("www.persta.ai");
  mockPathname.mockReturnValue("/ja/signup");
  const { getByTestId } = render(<XPixelScript />);
  expect(getByTestId("x-pixel").textContent).toContain(`"hide_page_location":true`);
});

