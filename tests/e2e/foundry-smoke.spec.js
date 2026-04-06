const { test, expect } = require("@playwright/test");
const { joinGame, waitForSLASystem } = require("./fixtures");

test.describe("Foundry join page", () => {
    test("loads join UI", async ({ page }) => {
        await page.goto("/join");
        await expect(page.getByRole("heading", { name: /join game session/i })).toBeVisible();
    });
});

test.describe("Foundry + SLA (requires env)", () => {
    test("joins world and loads SLA system", async ({ page }) => {
        test.skip(!process.env.FOUNDRY_USER, "Set FOUNDRY_USER (optional: FOUNDRY_URL, FOUNDRY_PASSWORD)");

        await joinGame(page);
        await waitForSLASystem(page);
    });
});
