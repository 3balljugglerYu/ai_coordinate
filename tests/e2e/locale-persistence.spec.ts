import { expect, test } from "@playwright/test";

test.describe("LocalePersistenceE2E from EARS specs", () => {
  test.describe("LPE-001 persist", () => {
    test.use({
      locale: "ja-JP",
      extraHTTPHeaders: {
        "Accept-Language": "ja-JP,ja;q=0.9,en;q=0.8",
      },
    });

    test("persist_英語localeCookieが保持されている場合_localeなし公開ルートでも英語を維持する", async ({
      page,
      context,
    }) => {
      // ============================================================
      // Arrange
      // ============================================================
      await context.clearCookies();
      await page.goto("/en");
      await expect(page).toHaveURL(/\/en$/);

      // ============================================================
      // Act
      // ============================================================
      await page.goto("/about?from=persist");

      // ============================================================
      // Assert
      // ============================================================
      await expect(page).toHaveURL(/\/en\/about\?from=persist$/);
      await expect(
        page.getByRole("heading", { level: 1, name: "About" })
      ).toBeVisible();
    });
  });

  test.describe("LPE-002 persist", () => {
    test.use({
      locale: "en-US",
      extraHTTPHeaders: {
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    test("persist_日本語localeCookieが保持されている場合_localeなし公開ルートでも日本語を維持する", async ({
      page,
      context,
    }) => {
      // ============================================================
      // Arrange
      // ============================================================
      await context.clearCookies();
      await page.goto("/ja");
      await expect(page).toHaveURL(/\/ja$/);

      // ============================================================
      // Act
      // ============================================================
      await page.goto("/about?from=persist");

      // ============================================================
      // Assert
      // ============================================================
      await expect(page).toHaveURL(/\/ja\/about\?from=persist$/);
      await expect(
        page.getByRole("heading", { level: 1, name: "サービス紹介" })
      ).toBeVisible();
    });
  });

  test.describe("LPE-003 persist", () => {
    test.use({
      locale: "ja-JP",
      extraHTTPHeaders: {
        "Accept-Language": "ja-JP,ja;q=0.9,en;q=0.8",
      },
    });

    test("persist_英語localeCookieが保持されている場合_内部リダイレクト後も英語ログインを描画する", async ({
      page,
      context,
    }) => {
      // ============================================================
      // Arrange
      // ============================================================
      await context.clearCookies();
      await page.goto("/en");
      await expect(page).toHaveURL(/\/en$/);

      // ============================================================
      // Act
      // ============================================================
      await page.goto("/my-page");

      // ============================================================
      // Assert
      // ============================================================
      await expect(page).toHaveURL(/\/login$/);
      await expect(
        page.getByRole("heading", { level: 2, name: "Log in" })
      ).toBeVisible();
      await expect(page.getByText("Log in to your account")).toBeVisible();
    });
  });

  test.describe("LPE-004 persist", () => {
    test.use({
      locale: "en-US",
      extraHTTPHeaders: {
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    test("persist_日本語localeCookieが保持されている場合_内部リダイレクト後も日本語ログインを描画する", async ({
      page,
      context,
    }) => {
      // ============================================================
      // Arrange
      // ============================================================
      await context.clearCookies();
      await page.goto("/ja");
      await expect(page).toHaveURL(/\/ja$/);

      // ============================================================
      // Act
      // ============================================================
      await page.goto("/my-page");

      // ============================================================
      // Assert
      // ============================================================
      await expect(page).toHaveURL(/\/login$/);
      await expect(
        page.getByRole("heading", { level: 2, name: "ログイン" })
      ).toBeVisible();
      await expect(page.getByText("アカウントにログインしてください")).toBeVisible();
    });
  });
});
