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
import {
  clearGeneratedCache,
  clearStockCache,
} from "@/features/generation/lib/picker-cache";

let fetchMock: jest.Mock;
beforeEach(() => {
  // 前テストの cache leak で initial state が引きずられないようにする
  clearGeneratedCache();
  clearStockCache();
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

  test("生成済みタイル選択でチェックマーク (selected) が出て、決定ボタンが有効化", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          {
            kind: "generated",
            id: "gen-1",
            imageUrl: "https://x/g.png",
            storagePath: "u/g.png",
            createdAt: "2026-01-01",
            generationType: "coordinate",
          },
        ],
        nextOffset: null,
      }),
    });
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
    // タイル表示まで待つ (default selection が走るので、最初の tile が
    // selected で hydrate される実装)
    const tiles = await screen.findAllByRole("button", {
      name: "selectImageAria",
    });
    // 初期 default selection 経由で aria-pressed=true がついている
    await waitFor(() => {
      expect(tiles[0]).toHaveAttribute("aria-pressed", "true");
    });

    // 決定ボタンも複数 (Drawer + Dialog) ある可能性 → enabled な方を確認
    const confirms = screen.getAllByRole("button", { name: "confirmAction" });
    const anyEnabled = confirms.some(
      (b) => !(b as HTMLButtonElement).disabled,
    );
    expect(anyEnabled).toBe(true);
  });

  test("決定ボタン押下で onSelectGenerated が選択中アイテムで呼ばれる", async () => {
    const user = userEvent.setup();
    const onSelectGenerated = jest.fn();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          {
            kind: "generated",
            id: "gen-2",
            imageUrl: "https://x/g2.png",
            storagePath: "u/g2.png",
            createdAt: "2026-01-01",
            generationType: "coordinate",
          },
        ],
        nextOffset: null,
      }),
    });

    render(
      <ImageSourcePicker
        open
        onOpenChange={() => {}}
        activeTab="generated"
        onTabChange={() => {}}
        onSelectGenerated={onSelectGenerated}
        onSelectStock={() => {}}
      />,
    );

    await screen.findAllByRole("button", { name: "selectImageAria" });

    // 初期 auto-select が反映されて decision ボタンが有効化されるまで待つ
    await waitFor(() => {
      const confirms = screen.getAllByRole("button", {
        name: "confirmAction",
      });
      expect(
        confirms.some((b) => !(b as HTMLButtonElement).disabled),
      ).toBe(true);
    });
    const confirms = screen.getAllByRole("button", { name: "confirmAction" });
    const enabled = confirms.find((b) => !(b as HTMLButtonElement).disabled);
    await user.click(enabled!);

    await waitFor(() => {
      expect(onSelectGenerated).toHaveBeenCalledWith(
        expect.objectContaining({ id: "gen-2" }),
      );
    });
  });

  test("currentPreviewUrl が渡されると preview として描画される", async () => {
    render(
      <ImageSourcePicker
        open
        onOpenChange={() => {}}
        activeTab="generated"
        onTabChange={() => {}}
        onSelectGenerated={() => {}}
        onSelectStock={() => {}}
        currentPreviewUrl="https://x/p.png"
        currentPreviewAlt="alt-text"
      />,
    );
    const preview = await screen.findByAltText("alt-text");
    expect(preview).toHaveAttribute("src", "https://x/p.png");
  });

  test("Mobile viewport (max-width:767px) では vaul Drawer 側が描画される", async () => {
    // matchMedia を mobile に切替
    Object.defineProperty(window, "matchMedia", {
      value: (query: string) => ({
        matches: true, // (max-width: 767px) がマッチ = mobile
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

    // Drawer 側のヘッダ "画像を選ぶ" (sheetTitle) は両方で出るが、
    // Drawer.Handle (data-vaul-drawer-handle) は Drawer 側のみ。
    // matchMedia=mobile では Dialog 側が null になるので、tablist は 1 つだけ。
    await waitFor(() => {
      expect(
        screen.getAllByRole("tab", { name: "tabGenerated" }),
      ).toHaveLength(1);
    });
  });

  test("disabled prop が true なら決定ボタンも disabled になる", async () => {
    render(
      <ImageSourcePicker
        open
        onOpenChange={() => {}}
        activeTab="generated"
        onTabChange={() => {}}
        onSelectGenerated={() => {}}
        onSelectStock={() => {}}
        disabled
      />,
    );
    const confirms = await screen.findAllByRole("button", {
      name: "confirmAction",
    });
    expect(
      confirms.every((b) => (b as HTMLButtonElement).disabled),
    ).toBe(true);
  });

  test("selectedStockId が渡されたら該当ストックタイルに selected が反映される", async () => {
    const stocksMock = jest.requireMock(
      "@/features/generation/lib/database",
    ) as { getSourceImageStocks: jest.Mock };
    stocksMock.getSourceImageStocks.mockResolvedValue([
      {
        id: "stock-X",
        user_id: "u",
        image_url: "https://x/s.png",
        storage_path: "p/s.png",
        name: "stock",
      },
    ]);

    render(
      <ImageSourcePicker
        open
        onOpenChange={() => {}}
        activeTab="stock"
        onTabChange={() => {}}
        onSelectGenerated={() => {}}
        onSelectStock={() => {}}
        selectedStockId="stock-X"
      />,
    );

    const tile = await screen.findByRole("button", {
      name: "selectImageAria",
    });
    expect(tile).toHaveAttribute("aria-pressed", "true");
  });
});
