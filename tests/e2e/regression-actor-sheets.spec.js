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

test.describe('SLA actor sheet UI — regression', () => {
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

    test('character sheet — stats matrix, tab rail, and stat roll control', async ({ page }) => {
        const actorId = await createTestActor(page, {
            stats: { str: { value: 4 }, dex: { value: 3 } }
        });
        const sheet = await openActorSheet(page, actorId);

        await expect(sheet.locator('.stats-matrix')).toBeVisible();
        await expect(sheet.locator('a.rollable[data-roll-type="stat"][data-key="str"]')).toBeVisible();
        await expect(sheet.locator('nav.sheet-tabs a[data-tab="main"]')).toBeVisible();
        await expect(sheet.locator('nav.sheet-tabs a[data-tab="combat"]')).toBeVisible();
        await expect(sheet.locator('nav.sheet-tabs a[data-tab="inventory"]')).toBeVisible();
        await expect(sheet.locator('nav.sheet-tabs a[data-tab="effects"]')).toBeVisible();
    });

    test('character sheet — tab navigation shows combat and inventory panels', async ({ page }) => {
        const actorId = await createTestActor(page);
        const sheet = await openActorSheet(page, actorId);

        await clickActorSheetTab(sheet, 'combat');
        await expect(sheet.locator('.tab[data-tab="combat"]')).toHaveClass(/active/);

        await clickActorSheetTab(sheet, 'inventory');
        await expect(sheet.locator('.tab[data-tab="inventory"]')).toHaveClass(/active/);

        await clickActorSheetTab(sheet, 'effects');
        await expect(sheet.locator('.tab[data-tab="effects"]')).toHaveClass(/active/);
    });

    test('character sheet — stat roll posts to chat', async ({ page }) => {
        const actorId = await createTestActor(page, {
            stats: { str: { value: 5 } }
        });
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
        await expect(page.getByRole('heading', { name: /STR\s+CHECK/i }).first()).toBeVisible();
    });
});

test.describe('SlaActor derived data — active effect ADD modes', () => {
    test.beforeEach(async ({ page }) => {
        test.skip(!process.env.FOUNDRY_USER, 'Set FOUNDRY_USER');
        await joinGame(page);
        await waitForSLASystem(page);
        const gm = await page.evaluate(() => game.user?.isGM === true);
        test.skip(!gm, 'Requires GM — use a Gamemaster account for FOUNDRY_USER');
    });

    test('v14 ADD change type (mode 20) increases core stat total', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([
                {
                    name: `E2E Actor v14 AE ${stamp}`,
                    type: 'character',
                    system: { stats: { str: { value: 3, bonus: 0 } } }
                }
            ]);
            await actor.createEmbeddedDocuments('ActiveEffect', [
                {
                    name: 'STR Boost v14',
                    disabled: false,
                    changes: [
                        {
                            key: 'system.stats.str.bonus',
                            mode: CONST.ACTIVE_EFFECT_CHANGE_TYPES.add,
                            value: 2
                        }
                    ]
                }
            ]);
            const total = actor.system.stats.str.total;
            await actor.delete();
            return total;
        });
        expect(result).toBe(5);
    });

    test('legacy ADD change type (mode 2) increases core stat total', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([
                {
                    name: `E2E Actor legacy AE ${stamp}`,
                    type: 'character',
                    system: { stats: { str: { value: 3, bonus: 0 } } }
                }
            ]);
            await actor.createEmbeddedDocuments('ActiveEffect', [
                {
                    name: 'STR Boost legacy',
                    disabled: false,
                    changes: [
                        {
                            key: 'system.stats.str.bonus',
                            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
                            value: 2
                        }
                    ]
                }
            ]);
            const total = actor.system.stats.str.total;
            await actor.delete();
            return total;
        });
        expect(result).toBe(5);
    });

    test('mixed v14 and legacy ADD modes stack on the same stat', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([
                {
                    name: `E2E Actor mixed AE ${stamp}`,
                    type: 'character',
                    system: { stats: { str: { value: 3, bonus: 0 } } }
                }
            ]);
            await actor.createEmbeddedDocuments('ActiveEffect', [
                {
                    name: 'V14 boost',
                    disabled: false,
                    changes: [
                        {
                            key: 'system.stats.str.bonus',
                            mode: CONST.ACTIVE_EFFECT_CHANGE_TYPES.add,
                            value: 2
                        }
                    ]
                },
                {
                    name: 'Legacy boost',
                    disabled: false,
                    changes: [
                        {
                            key: 'system.stats.str.bonus',
                            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
                            value: 1
                        }
                    ]
                }
            ]);
            const total = actor.system.stats.str.total;
            await actor.delete();
            return total;
        });
        expect(result).toBe(6);
    });
});
