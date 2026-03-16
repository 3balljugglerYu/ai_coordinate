import { expect, test } from "@playwright/test";

const LOCALE_COOKIE = "NEXT_LOCALE";

test.describe("LocaleBootstrapE2E from EARS specs", () => {
  test.describe("LBE-001 bootstrap", () => {
    test.use({
      locale: "en-US",
      extraHTTPHeaders: {
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    test("bootstrap_初回訪問でルートにアクセスした場合_locale付きホームへリダイレクトしてcookieを保存する", async ({
      page,
      context,
    }) => {
      // ============================================================
      // Arrange
      // ============================================================
      await context.clearCookies();

      // ============================================================
      // Act
      // ============================================================
      await page.goto("/");

      // ============================================================
      // Assert
      // ============================================================
      await expect(page).toHaveURL(/\/en$/);
      const cookies = await context.cookies();
      expect(cookies).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: LOCALE_COOKIE,
            value: "en",
            path: "/",
          }),
        ])
      );
    });
  });

  test.describe("LBE-002 bootstrap", () => {
    test.use({
      locale: "fr-FR",
      extraHTTPHeaders: {
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      },
    });

    test("bootstrap_欧州系または英語ブラウザの場合_初回訪問で英語ホームを描画する", async ({
      page,
      context,
    }) => {
      // ============================================================
      // Arrange
      // ============================================================
      await context.clearCookies();

      // ============================================================
      // Act
      // ============================================================
      await page.goto("/");

      // ============================================================
      // Assert
      // ============================================================
      await expect(page).toHaveURL(/\/en$/);
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Persta",
        })
      ).toBeVisible();
      await expect(
        page.getByText(
          "An AI styling platform for the looks and characters you want to create."
        )
      ).toBeVisible();
    });
  });

  test.describe("LBE-003 bootstrap", () => {
    test.use({
      locale: "ja-JP",
      extraHTTPHeaders: {
        "Accept-Language": "ja-JP,ja;q=0.9,en;q=0.8",
      },
    });

    test("bootstrap_日本語ブラウザの場合_初回訪問で日本語ホームを描画する", async ({
      page,
      context,
    }) => {
      // ============================================================
      // Arrange
      // ============================================================
      await context.clearCookies();

      // ============================================================
      // Act
      // ============================================================
      await page.goto("/");

      // ============================================================
      // Assert
      // ============================================================
      await expect(page).toHaveURL(/\/ja$/);
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Persta | ペルスタ",
        })
      ).toBeVisible();
      await expect(
        page.getByText("着てみたいも、なりたいも。AIスタイリングプラットフォーム")
      ).toBeVisible();
    });
  });

  test.describe("LBE-004 bootstrap", () => {
    test.use({
      locale: "de-DE",
      extraHTTPHeaders: {
        "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
      },
    });

    test("bootstrap_localeなし公開マーケティングURLの場合_queryを保持してlocale付き同等URLへリダイレクトする", async ({
      page,
      context,
    }) => {
      // ============================================================
      // Arrange
      // ============================================================
      await context.clearCookies();

      // ============================================================
      // Act
      // ============================================================
      await page.goto("/about?from=nav");

      // ============================================================
      // Assert
      // ============================================================
      await expect(page).toHaveURL(/\/en\/about\?from=nav$/);
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "About",
        })
      ).toBeVisible();
    });
  });
});
