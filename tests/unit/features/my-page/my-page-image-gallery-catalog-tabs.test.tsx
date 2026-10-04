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

  describe("一覧を横に払って隣のカタログへ移る", () => {
    /** 一覧の上で、指を startX から endX まで横に動かして離す */
    function swipeHorizontally(target: Element, startX: number, endX: number) {
      const send = (
        type: "touchstart" | "touchmove" | "touchend",
        x: number,
        timeStamp: number,
      ) => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        const touches = [{ identifier: 0, clientX: x, clientY: 300 }];
        Object.defineProperty(event, "touches", {
          value: type === "touchend" ? [] : touches,
        });
        Object.defineProperty(event, "changedTouches", { value: touches });
        Object.defineProperty(event, "timeStamp", { value: timeStamp });
        act(() => {
          target.dispatchEvent(event);
        });
      };
      send("touchstart", startX, 1000);
      for (let i = 1; i <= 8; i += 1) {
        send("touchmove", startX + ((endX - startX) * i) / 8, 1000 + i * 50);
      }
      send("touchend", endX, 1400);
    }

    const originalMatchMedia = window.matchMedia;
    afterEach(() => {
      window.matchMedia = originalMatchMedia;
    });

    /** 指で操作する端末にする(隣のカタログの一覧を先に読む) */
    function useTouchDevice() {
      window.matchMedia = ((query: string) => ({
        matches: query === "(pointer: coarse)",
        media: query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })) as unknown as typeof window.matchMedia;
    }

    test("公開前・一般の利用者: 払って切り替える仕組みを出さない", () => {
      render(
        <UserStylesAvailabilityProvider>
          <MyPageImageGalleryClient initialImages={INITIAL_IMAGES} />
        </UserStylesAvailabilityProvider>,
      );

      expect(screen.queryByTestId("catalog-swipe-panel")).toBeNull();
      expect(screen.getAllByTestId("my-image-card")).toHaveLength(2);
    });

    test("公開後: 左へ払うと次のカタログ(My Catalog)へ移り、サーバーで絞り込む", async () => {
      process.env.NEXT_PUBLIC_USER_STYLES_ENABLED = "true";
      fetchMock.mockImplementation(async () => mockFetchResponse([{ id: "mine-1" }]));

      render(
        <UserStylesAvailabilityProvider>
          <MyPageImageGalleryClient initialImages={INITIAL_IMAGES} />
        </UserStylesAvailabilityProvider>,
      );

      swipeHorizontally(screen.getByTestId("catalog-swipe-panel"), 600, 400);

      expect(
        screen
          .getByRole("tab", { name: "imageCatalogMyCatalog" })
          .getAttribute("aria-selected"),
      ).toBe("true");
      await waitFor(() =>
        expect(fetchMock.mock.calls[0][0]).toBe(
          "/api/my-page/images?filter=all&limit=20&offset=0&catalog=my_catalog",
        ),
      );
      expect(await screen.findByText("mine-1")).toBeTruthy();
    });

    test("公開後・指で操作する端末: 隣のカタログの先頭を先に読み、払ったらそのまま今の一覧にする", async () => {
      process.env.NEXT_PUBLIC_USER_STYLES_ENABLED = "true";
      useTouchDevice();
      fetchMock.mockImplementation(async () => mockFetchResponse([{ id: "mine-1" }]));

      render(
        <UserStylesAvailabilityProvider>
          <MyPageImageGalleryClient initialImages={INITIAL_IMAGES} />
        </UserStylesAvailabilityProvider>,
      );

      // 「全カタログ」の隣(My Catalog)だけを、今のタブ(すべて)で読む
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      expect(fetchMock.mock.calls[0][0]).toBe(
        "/api/my-page/images?filter=all&limit=20&offset=0&catalog=my_catalog",
      );
      // 払う前から、隣に見本として置いてある
      const peek = await screen.findByTestId("catalog-swipe-peek-next");
      await waitFor(() => expect(peek.textContent).toContain("mine-1"));

      swipeHorizontally(screen.getByTestId("catalog-swipe-panel"), 600, 400);

      expect(screen.getByTestId("catalog-swipe-current").textContent).toContain(
        "mine-1",
      );
      // 移った先の隣(Persta ORIGINAL)を読むが、My Catalog は読み直さない
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      expect(fetchMock.mock.calls[1][0]).toBe(
        "/api/my-page/images?filter=all&limit=20&offset=0&catalog=persta_original",
      );
    });
  });
});

/*
  新しく生成したあと(サーバーから最新の一覧 initialImages が届いたとき)。
  以前は「全カタログ × すべて」の控えだけを捨て、ほかの組み合わせ(例: すべて × My Catalog)は
  前に読んだ古い一覧のまま出していた。ページを読み直すまで新しい画像が出なかった(2026-10-04 報告)。
*/
describe("マイページの生成画像一覧: 最新の一覧が届いたとき", () => {
  const originalFlag = process.env.NEXT_PUBLIC_USER_STYLES_ENABLED;
  const originalFetch = global.fetch;
  afterAll(() => {
    process.env.NEXT_PUBLIC_USER_STYLES_ENABLED = originalFlag;
    global.fetch = originalFetch;
  });

  test("前に開いたカタログの一覧も読み直し、新しい画像を出す", async () => {
    process.env.NEXT_PUBLIC_USER_STYLES_ENABLED = "true";
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(mockFetchResponse([{ id: "old-mine" }]))
      .mockResolvedValue(mockFetchResponse([{ id: "new-mine" }, { id: "old-mine" }]));
    global.fetch = fetchMock as unknown as typeof fetch;

    const view = (images: GeneratedImageRecord[]) => (
      <UserStylesAvailabilityProvider>
        <MyPageImageGalleryClient initialImages={images} />
      </UserStylesAvailabilityProvider>
    );
    const { rerender } = render(view(INITIAL_IMAGES));

    // My Catalog を一度開く(古い一覧を控える)
    fireEvent.click(screen.getByRole("tab", { name: "imageCatalogMyCatalog" }));
    expect(await screen.findByText("old-mine")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "imageCatalogAll" }));

    // 生成のあと、サーバーから最新の一覧が届く
    rerender(view([{ id: "new-mine" }, ...INITIAL_IMAGES] as unknown as GeneratedImageRecord[]));
    expect(await screen.findByText("new-mine")).toBeTruthy();

    // もう一度 My Catalog を開くと読み直し、新しい画像が出る
    fireEvent.click(screen.getByRole("tab", { name: "imageCatalogMyCatalog" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1][0]).toBe(
      "/api/my-page/images?filter=all&limit=20&offset=0&catalog=my_catalog",
    );
    await waitFor(() =>
      expect(
        screen.getAllByTestId("my-image-card").map((card) => card.textContent),
      ).toEqual(["new-mine", "old-mine"]),
    );
  });

  test("読み込み中に最新の一覧が届いたら、古い読み込みの結果を混ぜない", async () => {
    process.env.NEXT_PUBLIC_USER_STYLES_ENABLED = "true";
    let resolveOld: (value: unknown) => void = () => {};
    const fetchMock = jest
      .fn()
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
      .mockResolvedValue(mockFetchResponse([{ id: "new-mine" }]));
    global.fetch = fetchMock as unknown as typeof fetch;

    const view = (images: GeneratedImageRecord[]) => (
      <UserStylesAvailabilityProvider>
        <MyPageImageGalleryClient initialImages={images} />
      </UserStylesAvailabilityProvider>
    );
    const { rerender } = render(view(INITIAL_IMAGES));
    fireEvent.click(screen.getByRole("tab", { name: "imageCatalogMyCatalog" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // 古い読み込みが終わる前に、最新の一覧が届く → 読み直す
    rerender(view([...INITIAL_IMAGES] as GeneratedImageRecord[]));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("new-mine")).toBeTruthy();

    // 遅れて古い結果が届いても混ざらない
    await act(async () => {
      resolveOld(mockFetchResponse([{ id: "stale-mine" }]));
    });
    expect(screen.queryByText("stale-mine")).toBeNull();
    expect(
      screen.getAllByTestId("my-image-card").map((card) => card.textContent),
    ).toEqual(["new-mine"]);
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
