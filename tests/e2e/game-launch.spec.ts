import { expect, test } from "@playwright/test";

test("loads the menu screen", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("#player-name-input")).toBeVisible();
  await expect(page.locator("#launch-btn")).toHaveText("Deploy");
  await expect(page.locator("#account-gate-text")).not.toBeEmpty();
});

test("can switch between menu views", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "ACCOUNT" }).click();
  await expect(page.locator("#menu-title")).toHaveText("ACCOUNT");

  await page.getByRole("button", { name: "SETTINGS" }).click();
  await expect(page.locator("#menu-title")).toHaveText("SETTINGS");
});
