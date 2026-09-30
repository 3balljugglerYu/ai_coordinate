/** @jest-environment jsdom */

/**
 * マイページの生成画像一覧の「どのカタログで作ったか」のタブ。
 *
 * カタログ刷新と同じ段階公開(useStylesCatalogRevamp)に乗る。モックせず実物の
 * Provider を通し、「一般の利用者は今のまま、運営・公開後はタブが出て、
 * タブ × カタログの組み合わせでサーバーに絞り込みを頼む」を確かめる。
 */

const stableTranslate = (key: string) => key;
jest.mock("next-intl", () => ({
  useTranslations: () => stableTranslate,
}));

jest.mock("react-intersection-observer", () => ({
  useInView: () => ({ ref: jest.fn(), inView: false }),
}));

jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

jest.mock("@/features/my-page/components/MyImageCard", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  return {
    MyImageCard: ({ image }: { image: { id: string } }) =>
      React.createElement("div", { "data-testid": "my-image-card" }, image.id),
  };
});

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MyPageImageGalleryClient } from "@/features/my-page/components/MyPageImageGalleryClient";
import {
  UserStylesAvailabilityProvider,
  UserStylesAvailabilityUpgrade,
} from "@/features/user-styles/components/UserStylesAvailabilityProvider";
import type { GeneratedImageRecord } from "@/features/generation/lib/database";

const INITIAL_IMAGES = [
  { id: "img-1" },
  { id: "img-2" },
] as unknown as GeneratedImageRecord[];

function mockFetchResponse(images: Array<{ id: string }>) {
  return {
    ok: true,
    json: async () => ({ images, hasMore: false }),
  };
}

describe("マイページの生成画像一覧: カタログのタブ", () => {
  const originalFlag = process.env.NEXT_PUBLIC_USER_STYLES_ENABLED;
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_USER_STYLES_ENABLED;
    fetchMock = jest.fn(async () => mockFetchResponse([]));
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_USER_STYLES_ENABLED = originalFlag;
    global.fetch = originalFetch;
  });

  test("公開前・一般の利用者: カタログのタブを出さず、今の一覧のまま", () => {
    render(
      <UserStylesAvailabilityProvider>
        <MyPageImageGalleryClient initialImages={INITIAL_IMAGES} />
      </UserStylesAvailabilityProvider>,
    );

    expect(
      screen.queryByRole("tablist", { name: "imageCatalogTabsLabel" }),
    ).toBeNull();
    expect(screen.getAllByTestId("my-image-card")).toHaveLength(2);
    // 最初の20件はサーバーで取ったものを使い、読み直さない
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("公開前・一般の利用者: 未投稿タブの読み込みにカタログを付けない", async () => {
    render(
      <UserStylesAvailabilityProvider>
        <MyPageImageGalleryClient initialImages={INITIAL_IMAGES} />
      </UserStylesAvailabilityProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "imageTabUnposted" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/my-page/images?filter=unposted&limit=20&offset=0",
    );
    // 空のときの案内も今のまま
    expect(await screen.findByText("emptyImagesDescription")).toBeTruthy();
  });

  test("公開前・運営: カタログのタブを出す(全カタログ / My Catalog / Persta ORIGINAL / User ORIGINAL)", async () => {
    await act(async () => {
      render(
        <UserStylesAvailabilityProvider>
          <MyPageImageGalleryClient initialImages={INITIAL_IMAGES} />
          <UserStylesAvailabilityUpgrade />
        </UserStylesAvailabilityProvider>,
      );
    });

    const tablist = screen.getByRole("tablist", { name: "imageCatalogTabsLabel" });
    const tabs = Array.from(tablist.querySelectorAll('[role="tab"]')).map(
      (tab) => tab.textContent,
    );
    expect(tabs).toEqual([
      "imageCatalogAll",
      "imageCatalogMyCatalog",
      "imageCatalogPerstaOriginal",
      "imageCatalogUserOriginal",
    ]);
    // 「すべて × すべて」は今と同じく最初の20件をそのまま使う
    expect(screen.getAllByTestId("my-image-card")).toHaveLength(2);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("公開後: カタログを選ぶと、タブと組み合わせてサーバーで絞り込む", async () => {
    process.env.NEXT_PUBLIC_USER_STYLES_ENABLED = "true";
    fetchMock.mockImplementation(async () => mockFetchResponse([{ id: "onetap-1" }]));

    render(
      <UserStylesAvailabilityProvider>
        <MyPageImageGalleryClient initialImages={INITIAL_IMAGES} />
      </UserStylesAvailabilityProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "imageTabUnposted" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/my-page/images?filter=unposted&limit=20&offset=0",
    );

    fireEvent.click(screen.getByRole("tab", { name: "imageCatalogPerstaOriginal" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1][0]).toBe(
      "/api/my-page/images?filter=unposted&limit=20&offset=0&catalog=persta_original",
    );
    expect(await screen.findByText("onetap-1")).toBeTruthy();

    // 一度開いた組み合わせは、戻ったときに読み直さない
    fireEvent.click(screen.getByRole("tab", { name: "imageCatalogAll" }));
    fireEvent.click(screen.getByRole("tab", { name: "imageCatalogPerstaOriginal" }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("公開後: 当てはまる画像が無いときは、選んだカタログに合わせて案内する", async () => {
    process.env.NEXT_PUBLIC_USER_STYLES_ENABLED = "true";

    render(
      <UserStylesAvailabilityProvider>
        <MyPageImageGalleryClient initialImages={INITIAL_IMAGES} />
      </UserStylesAvailabilityProvider>,
    );

    fireEvent.click(screen.getByRole("tab", { name: "imageCatalogUserOriginal" }));

    await waitFor(() =>
      expect(fetchMock.mock.calls[0][0]).toBe(
        "/api/my-page/images?filter=all&limit=20&offset=0&catalog=user_original",
      ),
    );
    expect(await screen.findByText("emptyCatalogImagesTitle")).toBeTruthy();
    expect(screen.getByText("emptyImagesDescriptionUserOriginal")).toBeTruthy();
  });
});

/*
  読み込みに失敗したとき。以前は失敗するとすぐ読み直し、失敗が続くあいだ問い合わせを
  繰り返していた。失敗したら止めて案内を出し、「もう一度読み込む」を押したときだけ読み直す。
  一般の利用者にも同じく効く(不具合の修正)。
*/
describe("マイページの生成画像一覧: 読み込みに失敗したとき", () => {
  const originalFetch = global.fetch;
  afterAll(() => {
    global.fetch = originalFetch;
  });

  test("自動では読み直さず、案内と「もう一度読み込む」を出す。押すと読み直す", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: "boom" }) })
      .mockResolvedValue(mockFetchResponse([{ id: "posted-1" }]));
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <UserStylesAvailabilityProvider>
        <MyPageImageGalleryClient initialImages={INITIAL_IMAGES} />
      </UserStylesAvailabilityProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "imageTabPosted" }));

    expect(await screen.findByTestId("my-images-load-failed")).toBeTruthy();
    // 失敗したまま少し待っても、問い合わせを繰り返さない
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // 「まだ画像がありません」と取り違えない
    expect(screen.queryByText("emptyImagesTitle")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "imageLoadRetry" }));

    expect(await screen.findByText("posted-1")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId("my-images-load-failed")).toBeNull();
  });
});
