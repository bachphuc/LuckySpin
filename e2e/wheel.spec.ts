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

/** Enter a name in the join dialog and press SPIN (no separate Join step). */
async function joinAndSpin(page: Page, name: string) {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder("Your name").fill(name);
  await dialog.getByRole("button", { name: "Spin" }).click();
  await expect(dialog).toBeHidden();
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
  await expect(alice.getByRole("heading", { name: "Lucky Draw - November", exact: true })).toBeVisible();
  await expect(alice.getByText("2 of 2 items remaining")).toBeVisible();

  // The join dialog opens as soon as the wheel loads, and SPIN needs a name.
  const dialog = alice.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Welcome to Lucky Draw - November" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Spin" })).toBeDisabled();
  await expect(alice.getByRole("banner").getByText(/Welcome/)).toHaveCount(0);
  await dialog.getByPlaceholder("Your name").fill("   ");
  await expect(dialog.getByRole("button", { name: "Spin" })).toBeDisabled();
  await joinAndSpin(alice, "Alice");
  await expect(alice.getByRole("button", { name: "Spinning…" })).toBeDisabled();
  const congrats = alice.getByText(/Congratulations, Alice! You won (Teddy bear|Gift card)\./);
  await expect(congrats).toBeVisible({ timeout: 15_000 });
  const aliceWon = (await congrats.textContent())!.match(/You won (.+)\.$/)![1];
  await expect(alice.getByRole("button", { name: "Already spun" })).toBeDisabled();

  // Refresh keeps identity and shows the previous result.
  await alice.reload({ waitUntil: "networkidle" });
  await expect(alice.getByText(`You already spun and won ${aliceWon}.`)).toBeVisible();
  await expect(alice.getByRole("dialog")).toHaveCount(0);
  await expect(alice.getByRole("banner")).toContainText("Welcome Alice");
  await expect(alice.getByText(/Spinning as/)).toHaveCount(0);
  await expect(alice.getByRole("button", { name: "Already spun" })).toBeDisabled();

  // A second participant in a separate browser context sees Alice's result.
  const bobContext = await browser.newContext();
  const bob = await bobContext.newPage();
  await bob.goto(url, { waitUntil: "networkidle" });
  await expect(bob.getByText("1 of 2 items remaining")).toBeVisible();
  await expect(bob.getByRole("listitem").filter({ hasText: "Alice" }).first()).toBeVisible();
  await joinAndSpin(bob, "Bob");
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
  await expect(carol.getByRole("dialog")).toHaveCount(0);
  await expect(carol.getByText("Results (2)")).toBeVisible();

  await bobContext.close();
  await carolContext.close();
});

test("shared wheel: unknown code shows not found", async ({ page }) => {
  await page.goto("/w/ZZZZZZZZZZ", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Wheel not found" })).toBeVisible();
});

test("join dialog: spin API failure keeps the dialog open, then retry succeeds", async ({ page }) => {
  const url = await createSharedWheel(page, "Hat\nScarf\nGloves", "Error wheel");
  await page.goto(url, { waitUntil: "networkidle" });

  let failNext = true;
  await page.route("**/api/wheels/*/spin", async (route) => {
    if (failNext) {
      failNext = false;
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ success: false, error: { code: "INVALID_REQUEST", message: "Simulated failure." } }),
      });
    } else {
      await route.continue();
    }
  });

  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("Your name").fill("Rita");
  await dialog.getByRole("button", { name: "Spin" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Simulated failure.");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByPlaceholder("Your name")).toHaveValue("Rita");
  await expect(page.getByText(/Congratulations/)).toHaveCount(0);
  await expect(page.getByText("3 of 3 items remaining")).toBeVisible();

  await dialog.getByRole("button", { name: "Spin" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/Congratulations, Rita! You won (Hat|Scarf|Gloves)\./)).toBeVisible({ timeout: 15_000 });
});

test("join dialog: watch-only mode, then reopen with stored name", async ({ page }) => {
  const url = await createSharedWheel(page, "X\nY", "Watch wheel");
  await page.goto(url, { waitUntil: "networkidle" });
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Just look at the results" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Results (0)")).toBeVisible();

  await page.getByRole("button", { name: "Join & spin" }).click();
  await expect(dialog).toBeVisible();
  await joinAndSpin(page, "Wanda");
  await expect(page.getByText(/Congratulations, Wanda!/)).toBeVisible({ timeout: 15_000 });
});

test("join dialog: stored participant who has not spun gets the dialog prefilled", async ({ page }) => {
  // Same situation as a participant whose earlier spin no longer exists on the wheel.
  const url = await createSharedWheel(page, "P\nQ", "Rejoin wheel");
  const code = url.split("/w/")[1];
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate((c) => {
    localStorage.setItem(
      `luckyspin:participant:${c}`,
      JSON.stringify({ participantId: crypto.randomUUID(), name: "Remy" }),
    );
  }, code);
  await page.reload({ waitUntil: "networkidle" });
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByPlaceholder("Your name")).toHaveValue("Remy");
  // Stored identity is still valid, so the toolbar greets them even before they spin again.
  await expect(page.getByRole("banner")).toContainText("Welcome Remy");
  await dialog.getByRole("button", { name: "Spin" }).click();
  await expect(page.getByText(/Congratulations, Remy!/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("banner")).toContainText("Welcome Remy");
});
