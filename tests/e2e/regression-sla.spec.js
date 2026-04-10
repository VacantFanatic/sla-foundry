const { test, expect } = require("@playwright/test");
const { joinGame, waitForSLASystem, dismissFoundryNotifications } = require("./fixtures");

const needsAuth = () => {
    test.skip(!process.env.FOUNDRY_USER, "Set FOUNDRY_USER (and FOUNDRY_URL / FOUNDRY_PASSWORD if needed)");
};

test.describe("SLA regression — authenticated", () => {
    test.beforeEach(async ({ page }) => {
        needsAuth();
        await joinGame(page);
        await waitForSLASystem(page);
    });

    test("game.system is sla-industries with expected version shape", async ({ page }) => {
        const info = await page.evaluate(() => ({
            id: game.system?.id,
            version: game.system?.version
        }));
        expect(info.id).toBe("sla-industries");
        expect(info.version).toMatch(/^\d+\.\d+\.\d+/);
    });

    test("game.sla exposes movement and hotbar API", async ({ page }) => {
        const api = await page.evaluate(() => ({
            rollOwnedItem: typeof game.sla?.rollOwnedItem,
            addActorItemToHotbar: typeof game.sla?.addActorItemToHotbar,
            canTokenMoveThisTurn: typeof game.sla?.canTokenMoveThisTurn
        }));
        expect(api.rollOwnedItem).toBe("function");
        expect(api.addActorItemToHotbar).toBe("function");
        expect(api.canTokenMoveThisTurn).toBe("function");
    });

    test("world setting systemMigrationVersion is semver-like", async ({ page }) => {
        const v = await page.evaluate(() => game.settings.get("sla-industries", "systemMigrationVersion"));
        expect(v).toMatch(/^\d+\.\d+\.\d+/);
    });

    test("boolean world settings are readable", async ({ page }) => {
        const keys = ["enableCombatMovementLock", "enableExplosiveThrowAutomation", "enableMigrationWorldBackup"];
        const ok = await page.evaluate((settingKeys) => {
            return settingKeys.every((k) => typeof game.settings.get("sla-industries", k) === "boolean");
        }, keys);
        expect(ok).toBe(true);
    });

    test("blast region visibility world setting is registered", async ({ page }) => {
        const mode = await page.evaluate(() => game.settings.get("sla-industries", "blastRegionVisibility"));
        expect(["observer", "always"]).toContain(mode);
    });

    test("Foundry v14+ Active Effect change types are available (effect stack smoke)", async ({ page }) => {
        const ok = await page.evaluate(() => {
            const t = globalThis.CONST?.ACTIVE_EFFECT_CHANGE_TYPES;
            const add = t?.ADD;
            return Boolean(t && typeof t === "object" && add !== undefined && add !== null);
        });
        expect(ok).toBe(true);
    });

    test("Configure Settings lists SLA Industries section", async ({ page }) => {
        await dismissFoundryNotifications(page);
        await page.getByRole("tab", { name: /game settings/i }).click();
        await page.getByRole("button", { name: /^game settings$/i }).click();
        await page.getByRole("button", { name: /SLA Industries 2nd Edition/i }).click();
        await expect(page.getByText(/Enable Combat Movement Lock/i).first()).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText(/Enable Explosive Throw Automation/i).first()).toBeVisible();
        await expect(page.getByText(/Explosive Blast Region Visibility/i).first()).toBeVisible();
        await page.keyboard.press("Escape");
    });

    test("Actors sidebar tab opens directory", async ({ page }) => {
        await page.getByRole("tab", { name: /^actors$/i }).click();
        await expect(page.getByRole("searchbox", { name: /search actors/i })).toBeVisible();
    });
});
