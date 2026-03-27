import { expect, test, type BrowserContext } from "@playwright/test";

const COORDINATE_PATH = "/coordinate";
const BASE_URL = `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? "3001"}`;
const LOCALE_COOKIE = "NEXT_LOCALE";

async function setLocaleCookie(
  context: BrowserContext,
  value: string
) {
  await context.addCookies([
    {
      name: LOCALE_COOKIE,
      value,
      url: BASE_URL,
      sameSite: "Lax",
    },
  ]);
}

test.describe("CoordinatePageE2E from EARS specs", () => {
  test.describe("CPE-001 access", () => {
    test.use({
      storageState: { cookies: [], origins: [] },
      locale: "ja-JP",
      extraHTTPHeaders: {
        "Accept-Language": "ja-JP,ja;q=0.9,en;q=0.8",
      },
    });

    test("access_未認証ブラウザの場合_loginへリダイレクトしてコーディネートUIを描画しない", async ({
      page,
      context,
    }) => {
      // Spec: CPE-001
      await context.clearCookies();
      await setLocaleCookie(context, "ja");

      await page.goto(COORDINATE_PATH);

      await expect(page).toHaveURL(/\/login$/);
      await expect(
        page.getByRole("heading", { level: 2, name: "ログイン" })
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { level: 1, name: "コーディネート" })
      ).toHaveCount(0);
    });
  });

  test.describe("CPE-002 render", () => {
    test.use({
      locale: "ja-JP",
      extraHTTPHeaders: {
        "Accept-Language": "ja-JP,ja;q=0.9,en;q=0.8",
      },
    });

    test("render_日本語localeの認証済みコーディネートページの場合_日本語copyを描画する", async ({
      page,
      context,
    }) => {
      // Spec: CPE-002
      await setLocaleCookie(context, "ja");

      await page.goto(COORDINATE_PATH);

      await expect(
        page.getByRole("heading", { level: 1, name: "コーディネート" })
      ).toBeVisible();
      await expect(
        page.getByText("人物画像をアップロードして、着せ替えを楽しみましょう")
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { level: 2, name: "生成結果一覧" })
      ).toBeVisible();
    });
  });

  test.describe("CPE-003 render", () => {
    test.use({
      locale: "en-US",
      extraHTTPHeaders: {
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    test("render_英語localeの認証済みコーディネートページの場合_英語copyを描画する", async ({
      page,
      context,
    }) => {
      // Spec: CPE-003
      await setLocaleCookie(context, "en");

      await page.goto(COORDINATE_PATH);

      await expect(
        page.getByRole("heading", { level: 1, name: "Coordinate" })
      ).toBeVisible();
      await expect(
        page.getByText("Upload a character image and enjoy styling with AI.")
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { level: 2, name: "Generated results" })
      ).toBeVisible();
      await expect(page.getByText("Percoin balance")).toBeVisible();
      await expect(page.getByText(/^\d[\d,]* Percoins$/)).toBeVisible();
    });
  });

  test.describe("CPE-004 render", () => {
    test.use({
      locale: "ja-JP",
      extraHTTPHeaders: {
        "Accept-Language": "ja-JP,ja;q=0.9,en;q=0.8",
      },
    });

    test("render_認証済みコーディネートページの場合_残高導線と生成ワークスペースを描画する", async ({
      page,
      context,
    }) => {
      // Spec: CPE-004
      await setLocaleCookie(context, "ja");

      await page.goto(COORDINATE_PATH);

      await expect(page.getByText("保有ペルコイン")).toBeVisible();
      await expect(page.getByText(/^\d[\d,]* ペルコイン$/)).toBeVisible();
      await expect(page.getByText("元画像の選択方法")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "ライブラリ" })
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "ストック" })
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { level: 2, name: "生成結果一覧" })
      ).toBeVisible();
    });
  });
});
