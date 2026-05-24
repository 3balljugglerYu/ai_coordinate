/**
 * @jest-environment jsdom
 */

const stableTranslate = (key: string) => key;
jest.mock("next-intl", () => ({
  useTranslations: () => stableTranslate,
}));

jest.mock("@/features/generation/lib/database", () => ({
  getSourceImageStocks: jest.fn(async () => []),
  getStockImageLimit: jest.fn(async () => 10),
  getCurrentStockImageCount: jest.fn(async () => 0),
  deleteSourceImageStock: jest.fn(async () => {}),
}));

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImageSourcePicker } from "@/features/generation/components/ImageSourcePicker/ImageSourcePicker";

let fetchMock: jest.Mock;
beforeEach(() => {
  fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ items: [], nextOffset: null }),
  });
  Object.defineProperty(globalThis, "fetch", {
    value: fetchMock,
    writable: true,
    configurable: true,
  });
  // matchMedia: PC viewport (>= 768px) でテスト
  Object.defineProperty(window, "matchMedia", {
    value: (query: string) => ({
      matches: false, // (max-width: 767px) でない = PC
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
      onchange: null,
    }),
    writable: true,
    configurable: true,
  });
});

describe("ImageSourcePicker", () => {
  test("open=true (PC) で Dialog を描画し、デフォルトで生成済みタブがアクティブ", async () => {
    render(
      <ImageSourcePicker
        open
        onOpenChange={() => {}}
        activeTab="generated"
        onTabChange={() => {}}
        onSelectGenerated={() => {}}
        onSelectStock={() => {}}
      />,
    );

    expect(
      await screen.findByRole("dialog"),
    ).toBeInTheDocument();
    // タブ 2 つ
    expect(
      screen.getByRole("tab", { name: "tabGenerated" }),
    ).toHaveAttribute("data-state", "active");
    expect(
      screen.getByRole("tab", { name: "tabStock" }),
    ).toHaveAttribute("data-state", "inactive");
  });

  test("タブ切替で onTabChange が呼ばれる", async () => {
    const user = userEvent.setup();
    const onTabChange = jest.fn();
    render(
      <ImageSourcePicker
        open
        onOpenChange={() => {}}
        activeTab="generated"
        onTabChange={onTabChange}
        onSelectGenerated={() => {}}
        onSelectStock={() => {}}
      />,
    );
    await user.click(screen.getByRole("tab", { name: "tabStock" }));
    expect(onTabChange).toHaveBeenCalledWith("stock");
  });

  test("生成済みタブ表示時にだけ /api/generation-history/picker を fetch", async () => {
    render(
      <ImageSourcePicker
        open
        onOpenChange={() => {}}
        activeTab="generated"
        onTabChange={() => {}}
        onSelectGenerated={() => {}}
        onSelectStock={() => {}}
      />,
    );
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/generation-history/picker"),
        expect.any(Object),
      );
    });
  });

  test("open=false なら Sheet も Dialog も描画されない", () => {
    render(
      <ImageSourcePicker
        open={false}
        onOpenChange={() => {}}
        activeTab="generated"
        onTabChange={() => {}}
        onSelectGenerated={() => {}}
        onSelectStock={() => {}}
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
