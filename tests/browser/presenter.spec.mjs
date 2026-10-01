import { test, expect } from "@playwright/test";

test("calculating a valuation sends it to the live feed", async ({ page }) => {
  const errors = [];
  const submissions = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => {
    if (request.url().endsWith("/api/submit-valuation")) submissions.push(request);
  });
  await page.goto("/performance/");
  await expect(page.locator(".performance-submit-notice")).toContainText("sent to the presenter’s live dashboard");
  const shared = page.waitForResponse(response => response.url().endsWith("/api/submit-valuation") && response.status() === 201);
  await page.getByRole("button", { name: "CALCULATE VALUE" }).click();
  await expect(page.getByTestId("ai-predicted-price")).not.toHaveText("₹ —");
  await shared;
  await expect(page.locator(".performance-submit-status")).toContainText("ESTIMATE SENT TO THE LIVE DASHBOARD");
  expect(submissions).toHaveLength(1);
  await page.goto("/presenter/");
  await page.getByLabel("PRESENTER KEY").fill("cardekho-playwright-only-key");
  await page.getByRole("button", { name: "OPEN DASHBOARD" }).click();
  await expect(page.locator(".presenter-feed tbody tr").first()).toContainText("Maruti Swift Dzire Vdi");
  await page.getByRole("button", { name: "RESET SUBMISSIONS" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("permanently deletes");
  await page.getByRole("button", { name: "CANCEL" }).click();
  await expect(page.locator(".presenter-feed tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "RESET SUBMISSIONS" }).click();
  await page.getByRole("button", { name: "YES, DELETE SUBMISSIONS" }).click();
  await expect(page.locator(".presenter-stats")).toContainText("0");
  await expect(page.locator(".presenter-feed tbody tr")).toHaveCount(0);
  await page.screenshot({ path: "test-results/presenter-live.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("presenter feed is locked without a secret", async ({ page }) => {
  await page.goto("/presenter/");
  await expect(page.getByRole("heading", { name: /THE ROOM/ })).toBeVisible();
  await expect(page.getByLabel("PRESENTER KEY")).toBeVisible();
  await expect(page.locator(".presenter-stats")).toHaveCount(0);
  await page.screenshot({ path: "test-results/presenter-locked.png" });
});
