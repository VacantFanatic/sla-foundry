const { test, expect } = require("@playwright/test");

async function joinGame(page) {
    const user = process.env.FOUNDRY_USER;
    if (!user) throw new Error("FOUNDRY_USER is required for this helper");
    await page.goto("/join");
    await page.getByRole("combobox").selectOption({ label: user });
    await page.getByRole("textbox", { name: /password/i }).fill(process.env.FOUNDRY_PASSWORD ?? "");
    await page.getByRole("button", { name: /join game session/i }).click();
    await page.waitForURL(/\/game/, { timeout: 60_000 });
}

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

        await page.waitForFunction(
            () => globalThis.game?.system?.id === "sla-industries",
            null,
            { timeout: 90_000 }
        );
    });
});
