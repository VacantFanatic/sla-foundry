/**
 * Dedicated accessibility / keyboard-only coverage. Previously the only accessibility
 * assertions anywhere in the suite were incidental aria-attribute checks embedded inside
 * UI specs written for other purposes (regression-actor-sheets, regression-item-sheets,
 * regression-dialogs) — none of them actually drove a sheet or dialog by keyboard alone.
 * This file exercises the WAI-ARIA APG "Tabs" keyboard pattern (Arrow/Home/End) added to
 * both sheet tab rails, and Escape-to-close on a dialog.
 */
const { test, expect } = require('@playwright/test');
const {
    joinGame,
    waitForSLASystem,
    dismissFoundryNotifications,
    createTestActor,
    createWorldItem,
    openActorSheet,
    openItemSheet,
    deleteTestActors,
    closeApplicationWindows
} = require('./fixtures');

test.describe.configure({ timeout: 60_000 });

test.describe('SLA accessibility — keyboard-only regression', () => {
    test.beforeEach(async ({ page }) => {
        test.skip(!process.env.FOUNDRY_USER, 'Set FOUNDRY_USER');
        await joinGame(page);
        await waitForSLASystem(page);
        const gm = await page.evaluate(() => game.user?.isGM === true);
        test.skip(!gm, 'Requires GM — use a Gamemaster account for FOUNDRY_USER');
        await page.evaluate(() => {
            if (globalThis.game?.paused) globalThis.game.togglePause();
        });
        await dismissFoundryNotifications(page);
    });

    test.afterEach(async ({ page }) => {
        await deleteTestActors(page);
        await closeApplicationWindows(page);
    });

    test('character sheet tab rail — ArrowRight/ArrowLeft move focus and activate the tab', async ({ page }) => {
        const actorId = await createTestActor(page);
        const sheet = await openActorSheet(page, actorId);

        const mainTab = sheet.locator('nav.sheet-tabs a[data-tab="main"]');
        await mainTab.focus();
        await expect(mainTab).toHaveAttribute('aria-selected', 'true');

        await page.keyboard.press('ArrowRight');
        const combatTab = sheet.locator('nav.sheet-tabs a[data-tab="combat"]');
        await expect(combatTab).toHaveAttribute('aria-selected', 'true');
        await expect(mainTab).toHaveAttribute('aria-selected', 'false');
        await expect(combatTab).toBeFocused();

        await page.keyboard.press('ArrowLeft');
        await expect(mainTab).toHaveAttribute('aria-selected', 'true');
        await expect(mainTab).toBeFocused();
    });

    test('character sheet tab rail — Home/End jump to the first/last tab', async ({ page }) => {
        const actorId = await createTestActor(page);
        const sheet = await openActorSheet(page, actorId);

        const tabs = sheet.locator('nav.sheet-tabs [role="tab"]');
        const count = await tabs.count();
        const firstTab = tabs.first();
        const lastTab = tabs.last();

        await firstTab.focus();
        await page.keyboard.press('End');
        await expect(lastTab).toHaveAttribute('aria-selected', 'true');
        await expect(lastTab).toBeFocused();

        await page.keyboard.press('Home');
        await expect(firstTab).toHaveAttribute('aria-selected', 'true');
        await expect(firstTab).toBeFocused();
        expect(count).toBeGreaterThan(1);
    });

    test('character sheet tab rail — ArrowRight wraps from the last tab to the first', async ({ page }) => {
        const actorId = await createTestActor(page);
        const sheet = await openActorSheet(page, actorId);

        const tabs = sheet.locator('nav.sheet-tabs [role="tab"]');
        const firstTab = tabs.first();
        const lastTab = tabs.last();

        await lastTab.focus();
        await page.keyboard.press('ArrowRight');
        await expect(firstTab).toHaveAttribute('aria-selected', 'true');
        await expect(firstTab).toBeFocused();
    });

    test('item sheet tab rail — ArrowRight moves focus and activates the tab (weapon sheet)', async ({ page }) => {
        const itemId = await createWorldItem(page, 'weapon');
        const sheet = await openItemSheet(page, itemId);

        const detailsTab = sheet.locator('nav.sheet-tabs a[data-tab="attributes"]');
        await detailsTab.focus();
        await expect(detailsTab).toHaveAttribute('aria-selected', 'true');

        await page.keyboard.press('ArrowRight');
        const descriptionTab = sheet.locator('nav.sheet-tabs a[data-tab="description"]');
        await expect(descriptionTab).toHaveAttribute('aria-selected', 'true');
        await expect(detailsTab).toHaveAttribute('aria-selected', 'false');
        await expect(descriptionTab).toBeFocused();
    });

    test('Escape closes the XP dialog without committing a change', async ({ page }) => {
        const actorId = await createTestActor(page, { xp: { value: 5 } });
        const sheet = await openActorSheet(page, actorId);

        await sheet.locator('.xp-button').click();
        const dialog = page.locator('.xp-dialog-window').last();
        await expect(dialog).toBeVisible();

        await dialog.locator('input[name="xpChange"]').fill('99');
        await page.keyboard.press('Escape');

        await expect(dialog).toHaveCount(0);
        expect(await page.evaluate((id) => game.actors.get(id)?.system.xp.value, actorId)).toBe(5);
    });
});
