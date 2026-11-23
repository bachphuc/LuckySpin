import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

async function createSharedWheel(page: Page, items: string, name: string): Promise<string> {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByLabel("Items (one per line)").fill(items);
  await page.getByRole("button", { name: "Share" }).click();
  await page.getByLabel("Wheel name").fill(name);
  await page.getByRole("button", { name: "Create share link" }).click();
  const url = await page.locator("#share-url").inputValue();
  expect(url).toMatch(/\/w\/[A-Za-z0-9]{10}$/);
  return url;
}

async function join(page: Page, name: string) {
  await page.getByLabel("Please enter your name before spinning.").fill(name);
  await page.getByRole("button", { name: "Join" }).click();
  await expect(page.getByText(`Spinning as ${name}`)).toBeVisible();
}

test("home: textarea builds the wheel and local spin shows a winner", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByLabel("Items (one per line)").fill("Red\n\n  Blue  \nRed\n");
  await page.getByRole("button", { name: "Create wheel" }).click();
  await expect(page.getByRole("img", { name: "Wheel with 3 items" })).toBeVisible();

  await page.getByRole("button", { name: "Spin" }).click();
  await expect(page.getByText(/^🎉 (Red|Blue)$/)).toBeVisible({ timeout: 15_000 });
});

test("home: validation rejects a single item", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByLabel("Items (one per line)").fill("Only one");
  await page.getByRole("button", { name: "Share" }).click();
  await expect(page.locator("#items-error")).toHaveText("Enter at least 2 items.");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("share: copy button copies the share URL", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const url = await createSharedWheel(page, "A\nB", "Copy test");
  await page.getByRole("button", { name: "Copy" }).click();
  await expect(page.getByRole("button", { name: "Copied!" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
});

test("shared wheel: two participants, refresh, live updates and completion", async ({ browser }) => {
  const alice = await browser.newPage();
  const url = await createSharedWheel(alice, "Teddy bear\nGift card", "Lucky Draw - November");

  await alice.goto(url, { waitUntil: "networkidle" });
  await expect(alice.getByRole("heading", { name: "Lucky Draw - November" })).toBeVisible();
  await expect(alice.getByText("2 of 2 items remaining")).toBeVisible();

  // Spin requires a name.
  await expect(alice.getByRole("button", { name: "Spin" })).toHaveCount(0);
  await join(alice, "Alice");
  await alice.getByRole("button", { name: "Spin" }).click();
  await expect(alice.getByRole("button", { name: "Spinning…" })).toBeDisabled();
  const congrats = alice.getByText(/Congratulations, Alice! You won (Teddy bear|Gift card)\./);
  await expect(congrats).toBeVisible({ timeout: 15_000 });
  const aliceWon = (await congrats.textContent())!.match(/You won (.+)\.$/)![1];
  await expect(alice.getByRole("button", { name: "Already spun" })).toBeDisabled();

  // Refresh keeps identity and shows the previous result.
  await alice.reload({ waitUntil: "networkidle" });
  await expect(alice.getByText(`You already spun and won ${aliceWon}.`)).toBeVisible();
  await expect(alice.getByRole("button", { name: "Already spun" })).toBeDisabled();

  // A second participant in a separate browser context sees Alice's result.
  const bobContext = await browser.newContext();
  const bob = await bobContext.newPage();
  await bob.goto(url, { waitUntil: "networkidle" });
  await expect(bob.getByText("1 of 2 items remaining")).toBeVisible();
  await expect(bob.getByRole("listitem").filter({ hasText: "Alice" }).first()).toBeVisible();
  await join(bob, "Bob");
  await bob.getByRole("button", { name: "Spin" }).click();
  const other = aliceWon === "Teddy bear" ? "Gift card" : "Teddy bear";
  await expect(bob.getByText(`Congratulations, Bob! You won ${other}.`)).toBeVisible({ timeout: 15_000 });

  // Bob took the last item: the wheel completes.
  await expect(bob.getByText("Completed: all 2 items awarded")).toBeVisible();
  await expect(bob.getByText("All prizes awarded")).toBeVisible({ timeout: 10_000 });

  // Alice's page picks this up by polling (every 3s), without a reload.
  await expect(alice.getByText("Completed: all 2 items awarded")).toBeVisible({ timeout: 10_000 });
  await expect(alice.getByRole("listitem").filter({ hasText: "Bob" }).first()).toBeVisible();

  // A newcomer to a completed wheel can't spin but sees all results.
  const carolContext = await browser.newContext();
  const carol = await carolContext.newPage();
  await carol.goto(url, { waitUntil: "networkidle" });
  await expect(carol.getByText("All prizes awarded")).toBeVisible();
  await expect(carol.getByLabel("Please enter your name before spinning.")).toHaveCount(0);
  await expect(carol.getByText("Results (2)")).toBeVisible();

  await bobContext.close();
  await carolContext.close();
});

test("shared wheel: unknown code shows not found", async ({ page }) => {
  await page.goto("/w/ZZZZZZZZZZ", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Wheel not found" })).toBeVisible();
});
