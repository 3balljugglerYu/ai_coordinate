import { expect, test, type Page } from "@playwright/test";

/**
 * 画像ソースピッカーの E2E スモークテスト。
 *
 * /style はゲストでもアクセス可能なため、認証なしで Picker のトリガ表示と
 * シート/モーダルの開閉、タブ切替までを通しで確認する。生成済みタブの
 * fetch は `/api/generation-history/picker` を route mock で 200 / 空配列に
 * 差し替え、未ログインでも一連の UI 動作を検証できるようにしている。
 */

async function mockPickerApi(page: Page) {
  // 生成済みピッカー API
  await page.route("**/api/generation-history/picker**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [], nextOffset: null }),
    });
  });
}

test.describe("ImageSourcePickerE2E", () => {
  test.use({
    locale: "ja-JP",
    extraHTTPHeaders: { "Accept-Language": "ja-JP,ja;q=0.9,en;q=0.8" },
  });

  test.beforeEach(async ({ page, context }) => {
    await context.addCookies([
      { name: "NEXT_LOCALE", value: "ja", url: "http://127.0.0.1:3001" },
    ]);
    await mockPickerApi(page);
  });

  test("style_モバイル表示_picker トリガをタップするとボトムシートが開いてタブが切替可能", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/style");

    const trigger = page.getByRole("button", {
      name: "生成済み/ストックから選ぶ",
    });
    await expect(trigger).toBeVisible();
    await trigger.click();

    // シート / モーダル どちらかにタブが現れる
    const generatedTab = page.getByRole("tab", { name: "生成済み" });
    const stockTab = page.getByRole("tab", { name: "ストック" });
    await expect(generatedTab).toBeVisible();
    await expect(stockTab).toBeVisible();
    await expect(generatedTab).toHaveAttribute("data-state", "active");

    // タブ切替
    await stockTab.click();
    await expect(stockTab).toHaveAttribute("data-state", "active");
    await expect(generatedTab).toHaveAttribute("data-state", "inactive");
  });

  test("style_PC 表示_picker は中央モーダル形式で開き、Escape で閉じる", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/style");

    const trigger = page.getByRole("button", {
      name: "生成済み/ストックから選ぶ",
    });
    await trigger.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });
});
