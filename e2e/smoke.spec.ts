import { test, expect } from "@playwright/test";

test("login renders", async ({ page }) => {
  await page.goto("/login");
  await expect(
    page.getByRole("button", { name: /Continue with Google/ }),
  ).toBeVisible();
});

test("Bluetooth printer guide renders", async ({ page }) => {
  await page.goto("/guides/bluetooth-printers");
  await expect(
    page.getByRole("heading", { level: 1, name: "Bluetooth printers" }),
  ).toBeVisible();
});
