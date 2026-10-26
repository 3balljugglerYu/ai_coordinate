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
    value: { ...originalLocation, hostname },
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
