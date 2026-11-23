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
  await expect(page.getByRole("heading", { name: "Mobile wheel", exact: true })).toBeVisible();
  expect(await noHorizontalScroll()).toBe(true);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // The dialog card sits fully inside the viewport, away from the bottom edge.
  const card = (await dialog.locator("form").boundingBox())!;
  const vp = page.viewportSize()!;
  expect(card.y).toBeGreaterThan(0);
  expect(card.y + card.height).toBeLessThan(vp.height);
  expect(card.x).toBeGreaterThanOrEqual(0);
  expect(card.x + card.width).toBeLessThanOrEqual(vp.width);
  const spinBox = (await dialog.getByRole("button", { name: "Spin" }).boundingBox())!;
  expect(spinBox.height).toBeGreaterThanOrEqual(48);
  await page.screenshot({ path: "test-results/mobile-dialog.png" });

  const longName = "Maximiliana Wolfeschlegelsteinhausen-X";
  await dialog.getByPlaceholder("Your name").fill(longName);
  await dialog.getByRole("button", { name: "Spin" }).tap();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/Congratulations, Maximiliana Wolfeschlegelsteinhausen-X! You won (One|Two|Three)\./)).toBeVisible({ timeout: 15_000 });
  // Toolbar greeting stays on one line inside the viewport, even for a long name.
  const welcome = page.getByRole("banner").getByText(/Welcome/);
  await expect(welcome).toBeVisible();
  const box = (await welcome.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(box.height).toBeLessThan(30);
  expect(await noHorizontalScroll()).toBe(true);
  await page.screenshot({ path: "test-results/mobile-shared.png", fullPage: true });
});
