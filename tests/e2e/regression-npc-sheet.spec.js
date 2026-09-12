const { test, expect } = require('@playwright/test');
const {
    joinGame,
    waitForSLASystem,
    dismissFoundryNotifications,
    createTestActor,
    openActorSheet,
    clickActorSheetTab,
    deleteTestActors,
    closeApplicationWindows
} = require('./fixtures');

test.describe.configure({ timeout: 60_000 });

test.describe('SLA NPC/Threat sheet UI — regression', () => {
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

    test('NPC sheet — stats table, tab rail, and tab navigation', async ({ page }) => {
        const actorId = await createTestActor(page, { stats: { str: { value: 6 }, dex: { value: 4 } } }, 'npc');
        const sheet = await openActorSheet(page, actorId);

        await expect(sheet.locator('input[name="system.stats.str.value"]')).toHaveValue('6');
        await expect(sheet.locator('a.rollable[data-roll-type="stat"][data-key="str"]')).toBeVisible();
        await expect(sheet.locator('a.rollable[data-roll-type="init"]')).toBeVisible();

        await expect(sheet.locator('nav.sheet-tabs a[data-tab="combat"]')).toBeVisible();
        await expect(sheet.locator('nav.sheet-tabs a[data-tab="inventory"]')).toBeVisible();
        await expect(sheet.locator('nav.sheet-tabs a[data-tab="effects"]')).toBeVisible();
        await expect(sheet.locator('nav.sheet-tabs a[data-tab="skills"]')).toBeVisible();
        await expect(sheet.locator('nav.sheet-tabs a[data-tab="notes"]')).toBeVisible();

        await clickActorSheetTab(sheet, 'skills');
        await expect(sheet.locator('.tab[data-tab="skills"]')).toHaveClass(/active/);

        await clickActorSheetTab(sheet, 'inventory');
        await expect(sheet.locator('.tab[data-tab="inventory"]')).toHaveClass(/active/);

        await clickActorSheetTab(sheet, 'notes');
        await expect(sheet.locator('.tab[data-tab="notes"]')).toHaveClass(/active/);
    });

    test('NPC sheet — stat roll posts to chat', async ({ page }) => {
        const actorId = await createTestActor(page, { stats: { str: { value: 6 } } }, 'npc');
        const sheet = await openActorSheet(page, actorId);

        await sheet.locator('a.rollable[data-roll-type="stat"][data-key="str"]').click();

        await expect
            .poll(
                async () =>
                    page.evaluate(() =>
                        globalThis.game?.messages?.contents?.some((m) => /STR\s+CHECK/i.test(String(m.content ?? '')))
                    ),
                { timeout: 15_000 }
            )
            .toBe(true);
    });

    // Regression guard for CHANGELOG 2.8.7: threat max-HP was unexpectedly read-only.
    test('NPC sheet — max HP field is editable, unlike the character sheet', async ({ page }) => {
        const actorId = await createTestActor(page, { hp: { value: 20, max: 20 } }, 'npc');
        const sheet = await openActorSheet(page, actorId);
        await clickActorSheetTab(sheet, 'combat');

        const maxHp = sheet.locator('input[name="system.hp.max"]');
        await expect(maxHp).not.toHaveAttribute('readonly', '');

        await maxHp.fill('30');
        await maxHp.blur();

        await expect.poll(async () => page.evaluate((id) => game.actors.get(id)?.system.hp.max, actorId)).toBe(30);
    });

    // Regression guard for CHANGELOG 2.8.5: duplicate `name` attributes silently corrupted form submission.
    test('NPC sheet — no duplicate name attributes among rendered form fields', async ({ page }) => {
        const actorId = await createTestActor(page, {}, 'npc');
        await openActorSheet(page, actorId);

        const duplicates = await page.evaluate((id) => {
            const app = Array.from(globalThis.ui.applications.values()).find((a) => a.actor?.id === id);
            const names = Array.from(app.element.querySelectorAll('[name]')).map((el) => el.getAttribute('name'));
            const seen = new Map();
            for (const name of names) seen.set(name, (seen.get(name) ?? 0) + 1);
            return [...seen.entries()].filter(([, count]) => count > 1).map(([name]) => name);
        }, actorId);

        expect(duplicates).toEqual([]);
    });
});
