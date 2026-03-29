import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const authFile = path.join(process.cwd(), "playwright/.auth/user.json");

test("authenticate test user", async ({ page }) => {
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "TEST_USER_EMAIL and TEST_USER_PASSWORD are required for Playwright auth setup."
    );
  }

  await mkdir(path.dirname(authFile), { recursive: true });

  await page.goto("/login?next=/coordinate");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator('form button[type="submit"]').click();

  await expect
    .poll(async () => {
      const cookies = await page.context().cookies();
      return cookies.some((cookie) => cookie.name.includes("auth-token"));
    })
    .toBe(true);

  await page.context().storageState({ path: authFile });
});
