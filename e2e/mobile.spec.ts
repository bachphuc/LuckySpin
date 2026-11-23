import { expect, test } from "@playwright/test";

test("mobile: home and shared page fit the viewport and spin works", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  const noHorizontalScroll = () =>
    page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(await noHorizontalScroll()).toBe(true);

  await page.getByLabel("Items (one per line)").fill("One\nTwo\nThree");
  await page.getByRole("button", { name: "Share" }).click();
  await page.getByLabel("Wheel name").fill("Mobile wheel");
  await page.getByRole("button", { name: "Create share link" }).click();
  const url = await page.locator("#share-url").inputValue();

  await page.goto(url, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Mobile wheel" })).toBeVisible();
  expect(await noHorizontalScroll()).toBe(true);
  await page.getByLabel("Please enter your name before spinning.").fill("Mia");
  await page.getByRole("button", { name: "Join" }).click();
  await page.getByRole("button", { name: "Spin" }).tap();
  await expect(page.getByText(/Congratulations, Mia! You won (One|Two|Three)\./)).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: "test-results/mobile-shared.png", fullPage: true });
});
