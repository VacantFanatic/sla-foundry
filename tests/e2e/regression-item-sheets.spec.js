const { test, expect } = require("@playwright/test");
const {
    joinGame,
    waitForSLASystem,
    dismissFoundryNotifications,
    createWorldItem,
    openItemSheet,
    clickItemSheetTab,
    closeApplicationWindows
} = require("./fixtures");

test.describe.configure({ timeout: 60_000 });

test.describe("SLA item sheet UI — regression", () => {
    test.beforeEach(async ({ page }) => {
        test.skip(!process.env.FOUNDRY_USER, "Set FOUNDRY_USER");
        await joinGame(page);
        await waitForSLASystem(page);
        const gm = await page.evaluate(() => game.user?.isGM === true);
        test.skip(!gm, "Requires GM — use a Gamemaster account for FOUNDRY_USER");
        await page.evaluate(() => {
            if (globalThis.game?.paused) globalThis.game.togglePause();
        });
        await dismissFoundryNotifications(page);
    });

    test.afterEach(async ({ page }) => {
        await page.evaluate(async () => {
            for (const item of game.items.filter((i) => i.name?.startsWith("E2E Item "))) {
                await item.delete();
            }
        }).catch(() => {});
        await closeApplicationWindows(page);
    });

    test("discipline sheet — two tabs, spectral stamp, rank field", async ({ page }) => {
        const itemId = await createWorldItem(page, "discipline", { rank: 2 });
        const sheet = await openItemSheet(page, itemId);

        await expect(sheet.locator(".spectral-stamp")).toHaveText("Ebb Discipline");
        await expect(sheet.locator(".spectral-container--discipline")).toBeVisible();
        await expect(sheet.locator('input[name="system.rank"]')).toHaveValue("2");
        await expect(sheet.locator('nav.sheet-tabs a[data-tab="attributes"]')).toBeVisible();
        await expect(sheet.locator('nav.sheet-tabs a[data-tab="description"]')).toBeVisible();
        await expect(sheet.locator('nav.sheet-tabs a[data-tab="effects"]')).toHaveCount(0);
    });

    test("ebb formula sheet — spectral layout, discipline drop zone, effects tab", async ({ page }) => {
        const itemId = await createWorldItem(page, "ebbFormula", {
            formulaRating: 3,
            cost: 2,
            ebbEffect: "damage",
            discipline: ""
        });
        const sheet = await openItemSheet(page, itemId);

        await expect(sheet.locator(".spectral-stamp")).toHaveText("Ebb Formula");
        await expect(sheet.getByText("Formula Data")).toBeVisible();
        await expect(sheet.locator(".spectral-container--formula")).toBeVisible();
        await expect(sheet.locator(".sla-drop.discipline-drop-zone")).toBeVisible();
        await expect(sheet.locator(".sla-drop__hint")).toHaveText("Drop Discipline Item Here");
        await expect(sheet.locator('input[name="system.formulaRating"]')).toHaveValue("3");

        await clickItemSheetTab(sheet, "effects");
        await expect(sheet.locator(".sla-item-effects .sla-section__title")).toHaveText("Active Effects");
        await expect(sheet.locator(".sla-effects-empty")).toHaveText("No active effects.");
        await expect(sheet.locator(".sla-item-effect-create")).toBeVisible();
    });

    test("weapon sheet — skill drop hint and effects tab", async ({ page }) => {
        const itemId = await createWorldItem(page, "weapon", {
            attackType: "ranged",
            skill: "",
            damage: "1d10"
        });
        const sheet = await openItemSheet(page, itemId);

        await expect(sheet.locator(".sla-drop.skill-link-box")).toBeVisible();
        await expect(sheet.locator(".sla-drop__hint")).toHaveText("Drop Skill Item Here");
        await clickItemSheetTab(sheet, "effects");
        await expect(sheet.getByPlaceholder("Search effects")).toBeVisible();
    });

    test("magazine sheet — weapon drop hint", async ({ page }) => {
        const itemId = await createWorldItem(page, "magazine", {
            capacity: 30,
            linkedWeapon: ""
        });
        const sheet = await openItemSheet(page, itemId);

        await expect(sheet.locator(".sla-drop.weapon-link")).toBeVisible();
        await expect(sheet.locator(".sla-drop__hint")).toHaveText("Drop Weapon Here");
    });

    test("skill sheet — field manual stamp, two tabs only", async ({ page }) => {
        const itemId = await createWorldItem(page, "skill", { rank: 1 });
        const sheet = await openItemSheet(page, itemId);

        await expect(sheet.locator(".field-manual__stamp")).toHaveText("Field Manual");
        await expect(sheet.locator('nav.sheet-tabs a[data-tab="effects"]')).toHaveCount(0);
    });

    test("generic item sheet — inventory slip stamp", async ({ page }) => {
        const itemId = await createWorldItem(page, "item", { weight: 1 });
        const sheet = await openItemSheet(page, itemId);

        await expect(sheet.getByText("Inventory Slip")).toBeVisible();
        await clickItemSheetTab(sheet, "effects");
        await expect(sheet.getByText("Transferable effects apply")).toBeVisible();
    });

    test("drop zones toggle is-drag-over during dragenter", async ({ page }) => {
        const itemId = await createWorldItem(page, "weapon", { skill: "" });
        await openItemSheet(page, itemId);

        const toggled = await page.evaluate(() => {
            const zone = document.querySelector("form.application.sla-industries.item .sla-drop");
            if (!zone) return { found: false };
            zone.dispatchEvent(new DragEvent("dragenter", { bubbles: true, cancelable: true }));
            const active = zone.classList.contains("is-drag-over");
            zone.dispatchEvent(new DragEvent("dragleave", { bubbles: true, cancelable: true }));
            return { found: true, active };
        });

        expect(toggled.found).toBe(true);
        expect(toggled.active).toBe(true);
    });

    test("effects tab — create embedded active effect", async ({ page }) => {
        const itemId = await createWorldItem(page, "item", {});
        const sheet = await openItemSheet(page, itemId);

        await clickItemSheetTab(sheet, "effects");
        await sheet.locator(".sla-item-effect-create").click();

        await expect(sheet.locator(".sla-item-effect-row")).toHaveCount(1);
        await expect(sheet.getByText("No active effects.")).toHaveCount(0);
    });
});
