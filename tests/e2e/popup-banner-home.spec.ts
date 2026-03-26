import { expect, test } from "@playwright/test";

test.describe("PopupBannerHomeE2E from EARS specs", () => {
  test.use({
    locale: "ja-JP",
    extraHTTPHeaders: {
      "Accept-Language": "ja-JP,ja;q=0.9,en;q=0.8",
    },
  });

  test("home_popupFixture有効時_バナーが表示され閉じると消える", async ({
    page,
    context,
  }) => {
    // Spec: PBHE-001
    await context.clearCookies();
    await page.goto("/ja?popupBannerE2E=1");

    const popupBannerImage = page.getByRole("img", { name: "E2E Popup Banner" });
    await expect(popupBannerImage).toBeVisible();

    await page.getByRole("button", { name: "閉じる" }).click();

    await expect(popupBannerImage).toBeHidden();
  });
});
