import { test, expect } from "@playwright/test";

test.describe("auth guard", () => {
  for (const path of ["/", "/dashboard", "/dashboard/printers"]) {
    test(`redirects anonymous ${path} to /login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    });
  }
});
