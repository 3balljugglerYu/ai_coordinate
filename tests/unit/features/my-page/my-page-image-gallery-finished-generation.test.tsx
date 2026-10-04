/** @jest-environment jsdom */

/**
 * マイページを開いたまま生成が終わったとき(2026-10-04 報告)。
 * ⭐ 一覧を作り直さず、今の一覧の先頭に新しい画像だけを差し込む(スクロール位置を飛ばさない)。
 * 生成の完了の見張りは useFinishedGenerationWatcher(別のテスト)。ここでは知らせを受けたあとを見る。
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
let mockOnFinished: () => void = () => {};
jest.mock("@/features/my-page/hooks/useFinishedGenerationWatcher", () => ({
  useFinishedGenerationWatcher: (onFinished: () => void) => {
    mockOnFinished = onFinished;
  },
}));

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MyPageImageGalleryClient } from "@/features/my-page/components/MyPageImageGalleryClient";
import { UserStylesAvailabilityProvider } from "@/features/user-styles/components/UserStylesAvailabilityProvider";
import type { GeneratedImageRecord } from "@/features/generation/lib/database";

const INITIAL_IMAGES = [{ id: "img-1" }, { id: "img-2" }] as unknown as GeneratedImageRecord[];

function respond(images: Array<{ id: string }>) {
  return { ok: true, json: async () => ({ images, hasMore: false }) };
}

const cards = () => screen.getAllByTestId("my-image-card").map((card) => card.textContent);
/**
 * 一覧は react-masonry-css の2列に交互に振り分けて描くので(MyImageGallery)、
 * DOM の並びは「左列 → 右列」になる(3枚なら 1枚目・3枚目・2枚目)。
 * 並びの意味(新しい順)で比べるため、列から元の順に戻す。
 */
const listOrder = () => {
  const dom = cards();
  const left = Math.ceil(dom.length / 2);
  const order: (string | null)[] = [];
  for (let i = 0; i < left; i += 1) {
    order.push(dom[i]);
    if (left + i < dom.length) order.push(dom[left + i]);
  }
  return order;
};

describe("マイページを開いたまま生成が終わったとき", () => {
  const originalFlag = process.env.NEXT_PUBLIC_USER_STYLES_ENABLED;
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_USER_STYLES_ENABLED = "true";
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterAll(() => {
    process.env.NEXT_PUBLIC_USER_STYLES_ENABLED = originalFlag;
    global.fetch = originalFetch;
  });

  function renderGallery() {
    return render(
      <UserStylesAvailabilityProvider>
        <MyPageImageGalleryClient initialImages={INITIAL_IMAGES} />
      </UserStylesAvailabilityProvider>,
    );
  }

  test("すべて × 全カタログ: 先頭を読み、新しい画像だけを先頭に差し込む", async () => {
    fetchMock.mockResolvedValue(respond([{ id: "new-1" }, { id: "img-1" }, { id: "img-2" }]));
    renderGallery();
    expect(cards()).toEqual(["img-1", "img-2"]);

    await act(async () => mockOnFinished());

    await waitFor(() => expect(listOrder()).toEqual(["new-1", "img-1", "img-2"]));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/my-page/images?filter=all&limit=20&offset=0");
  });

  test("My Catalog を見ているとき: 今の一覧はそのままに先頭へ足し、全カタログの先頭も更新する", async () => {
    fetchMock
      // My Catalog を開く
      .mockResolvedValueOnce(respond([{ id: "mine-1" }, { id: "mine-2" }]))
      // 生成が終わった: 今の一覧(My Catalog)の先頭
      .mockResolvedValueOnce(respond([{ id: "new-mine" }, { id: "mine-1" }, { id: "mine-2" }]))
      // 生成が終わった: すべて × 全カタログの先頭
      .mockResolvedValueOnce(respond([{ id: "new-mine" }, { id: "img-1" }, { id: "img-2" }]));
    renderGallery();
    fireEvent.click(screen.getByRole("tab", { name: "imageCatalogMyCatalog" }));
    await waitFor(() => expect(cards()).toEqual(["mine-1", "mine-2"]));

    await act(async () => mockOnFinished());

    await waitFor(() => expect(listOrder()).toEqual(["new-mine", "mine-1", "mine-2"]));
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "/api/my-page/images?filter=all&limit=20&offset=0&catalog=my_catalog",
      "/api/my-page/images?filter=all&limit=20&offset=0&catalog=my_catalog",
      "/api/my-page/images?filter=all&limit=20&offset=0",
    ]);

    // 全カタログに戻ると、読み直さずに新しい画像が先頭にある
    fireEvent.click(screen.getByRole("tab", { name: "imageCatalogAll" }));
    await waitFor(() => expect(listOrder()).toEqual(["new-mine", "img-1", "img-2"]));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test("新しい画像が無ければ、一覧は変えない", async () => {
    fetchMock.mockResolvedValue(respond([{ id: "img-1" }, { id: "img-2" }]));
    renderGallery();

    await act(async () => mockOnFinished());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(cards()).toEqual(["img-1", "img-2"]);
  });

  test("先頭の読み込みに失敗しても、今の一覧はそのまま", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "boom" }) });
    renderGallery();

    await act(async () => mockOnFinished());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(cards()).toEqual(["img-1", "img-2"]);
    expect(screen.queryByText("imageLoadRetry")).toBeNull();
  });
});
