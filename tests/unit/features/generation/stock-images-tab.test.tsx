/**
 * @jest-environment jsdom
 */

const stableTranslate = (key: string) => key;
jest.mock("next-intl", () => ({
  useTranslations: () => stableTranslate,
}));

jest.mock("@/features/generation/lib/database", () => ({
  getSourceImageStocks: jest.fn(),
  getStockImageLimit: jest.fn(),
  getCurrentStockImageCount: jest.fn(),
  deleteSourceImageStock: jest.fn(),
}));

jest.mock("@/features/generation/lib/validation", () => ({
  DEFAULT_IMAGE_CONFIG: { allowedFormats: ["image/png", "image/jpeg"] },
  validateImageFile: jest.fn(),
}));

jest.mock("@/features/generation/lib/normalize-source-image", () => ({
  normalizeSourceImage: jest.fn(async (file: File) => file),
}));

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StockImagesTab } from "@/features/generation/components/ImageSourcePicker/StockImagesTab";
import {
  deleteSourceImageStock,
  getCurrentStockImageCount,
  getSourceImageStocks,
  getStockImageLimit,
} from "@/features/generation/lib/database";
import { clearStockCache } from "@/features/generation/lib/picker-cache";

const mockGetSourceImageStocks = getSourceImageStocks as jest.MockedFunction<
  typeof getSourceImageStocks
>;
const mockGetStockImageLimit = getStockImageLimit as jest.MockedFunction<
  typeof getStockImageLimit
>;
const mockGetCurrentStockImageCount =
  getCurrentStockImageCount as jest.MockedFunction<
    typeof getCurrentStockImageCount
  >;
const mockDeleteSourceImageStock =
  deleteSourceImageStock as jest.MockedFunction<typeof deleteSourceImageStock>;

beforeEach(() => {
  jest.clearAllMocks();
  // モジュールスコープの cache がテスト間でリークするとモック呼び出し回数や
  // 初期 hasLoadedOnce が変わるので、各テストで必ずクリアする。
  clearStockCache();
  // confirm を yes に
  window.confirm = jest.fn(() => true);
  window.alert = jest.fn();
});

function makeStock(id: string, overrides: Partial<{ image_url: string }> = {}) {
  return {
    id,
    user_id: "u1",
    image_url: overrides.image_url ?? `https://cdn.example/${id}.webp`,
    storage_path: `u1/stocks/${id}.webp`,
    name: `stock-${id}`,
    last_used_at: null,
    usage_count: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
  };
}

describe("StockImagesTab", () => {
  test("active=false の間は fetch しない", async () => {
    render(<StockImagesTab active={false} onSelect={() => {}} />);
    await Promise.resolve();
    expect(mockGetSourceImageStocks).not.toHaveBeenCalled();
  });

  test("ストック一覧 + +追加タイル + 上限ラベルを描画する", async () => {
    mockGetSourceImageStocks.mockResolvedValueOnce([
      makeStock("a"),
      makeStock("b"),
    ]);
    mockGetStockImageLimit.mockResolvedValueOnce(10);
    mockGetCurrentStockImageCount.mockResolvedValueOnce(2);

    render(<StockImagesTab active onSelect={() => {}} />);

    await waitFor(() => {
      expect(mockGetSourceImageStocks).toHaveBeenCalledWith(50, 0);
    });
    // 2 stock tiles + 1 +追加 tile = 3 buttons of "this kind"
    expect(
      await screen.findAllByRole("button", { name: "selectImageAria" }),
    ).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "stockAddTileAria" }),
    ).toBeInTheDocument();
    // 上限ラベル
    expect(screen.getByText("stockCountStatus")).toBeInTheDocument();
  });

  test("上限到達時は +追加 が disabled になる", async () => {
    mockGetSourceImageStocks.mockResolvedValueOnce([makeStock("a")]);
    mockGetStockImageLimit.mockResolvedValueOnce(1);
    mockGetCurrentStockImageCount.mockResolvedValueOnce(1);

    render(<StockImagesTab active onSelect={() => {}} />);
    const addTile = await screen.findByRole("button", {
      name: "stockAddTileAria",
    });
    expect(addTile).toBeDisabled();
    expect(screen.getByText("stockCountStatusLimitReached")).toBeInTheDocument();
  });

  test("ストックタイル クリックで onSelect を呼ぶ", async () => {
    const user = userEvent.setup();
    const onSelect = jest.fn();
    mockGetSourceImageStocks.mockResolvedValueOnce([makeStock("a")]);
    mockGetStockImageLimit.mockResolvedValueOnce(10);
    mockGetCurrentStockImageCount.mockResolvedValueOnce(1);

    render(<StockImagesTab active onSelect={onSelect} />);
    const tile = await screen.findByRole("button", { name: "selectImageAria" });
    await user.click(tile);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "a" }),
    );
  });

  test("削除ボタン → confirm yes で API 呼び出し + リストから除去", async () => {
    const user = userEvent.setup();
    const onDeleted = jest.fn();
    mockGetSourceImageStocks.mockResolvedValueOnce([makeStock("a"), makeStock("b")]);
    mockGetStockImageLimit.mockResolvedValueOnce(10);
    mockGetCurrentStockImageCount.mockResolvedValueOnce(2);
    mockDeleteSourceImageStock.mockResolvedValueOnce(undefined);

    render(
      <StockImagesTab active onSelect={() => {}} onDeleted={onDeleted} />,
    );
    const deleteBtns = await screen.findAllByRole("button", {
      name: "stockDeleteAria",
    });
    await user.click(deleteBtns[0]);

    await waitFor(() => {
      expect(mockDeleteSourceImageStock).toHaveBeenCalledWith("a");
    });
    expect(onDeleted).toHaveBeenCalledWith("a");
  });
});
