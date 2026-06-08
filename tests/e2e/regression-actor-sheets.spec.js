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

/** Dice-icon stat roll control (play mode also has a clickable total). */
function statRollDice(sheet, key) {
    return sheet.locator(`.stat-box a.rollable[data-roll-type="stat"][data-key="${key}"]:has(.fa-dice-d20)`);
}

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
        await expect(statRollDice(sheet, 'str')).toBeVisible();
        await expect(sheet.locator('nav.sheet-tabs a[data-tab="main"]')).toBeVisible();
        await expect(sheet.locator('nav.sheet-tabs a[data-tab="combat"]')).toBeVisible();
        await expect(sheet.locator('nav.sheet-tabs a[data-tab="inventory"]')).toBeVisible();
        await expect(sheet.locator('nav.sheet-tabs a[data-tab="effects"]')).toBeVisible();
        await expect(sheet.locator('nav.sheet-tabs a[data-tab="traits"]')).toBeVisible();
        await expect(sheet.locator('nav.sheet-tabs a[data-tab="notes"]')).toBeVisible();
    });

    test('character sheet — tab navigation shows combat, inventory, traits, and notes panels', async ({ page }) => {
        const actorId = await createTestActor(page);
        const sheet = await openActorSheet(page, actorId);

        await clickActorSheetTab(sheet, 'combat');
        await expect(sheet.locator('.tab[data-tab="combat"]')).toHaveClass(/active/);
        await expect(sheet.locator('.sla-combat-loadout')).toBeVisible();

        await clickActorSheetTab(sheet, 'inventory');
        await expect(sheet.locator('.tab[data-tab="inventory"]')).toHaveClass(/active/);

        await clickActorSheetTab(sheet, 'effects');
        await expect(sheet.locator('.tab[data-tab="effects"]')).toHaveClass(/active/);
        await expect(sheet.locator('.sla-effect-search')).toBeVisible();

        await clickActorSheetTab(sheet, 'traits');
        await expect(sheet.locator('.tab[data-tab="traits"]')).toHaveClass(/active/);
        await expect(sheet.locator('.sla-traits-panel')).toBeVisible();

        await clickActorSheetTab(sheet, 'notes');
        await expect(sheet.locator('.tab[data-tab="notes"]')).toHaveClass(/active/);
        await expect(sheet.locator('.sla-notes-panel')).toBeVisible();
    });

    test('character sheet — stat roll posts to chat', async ({ page }) => {
        const actorId = await createTestActor(page, {
            stats: { str: { value: 5 } }
        });
        const sheet = await openActorSheet(page, actorId);

        await statRollDice(sheet, 'str').click();

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

    test('character sheet — play-mode stat total is also a roll target', async ({ page }) => {
        const actorId = await createTestActor(page, {
            stats: { str: { value: 5 } }
        });
        const sheet = await openActorSheet(page, actorId);

        await sheet.locator('a.rollable.sla-stat-play-hit[data-key="str"]').click();

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

    test('character sheet — Edit/Play mode banner and HP bar', async ({ page }) => {
        const actorId = await createTestActor(page, {
            hp: { value: 4, max: 10 },
            stats: { str: { value: 3 } }
        });
        const sheet = await openActorSheet(page, actorId);

        await expect(sheet.locator('.sla-stat-mode-banner')).toBeVisible();
        await expect(sheet.locator('.sla-hp-bar__fill.is-critical')).toBeVisible();
    });

    test('character sheet — effects search filters rows', async ({ page }) => {
        const actorId = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([
                {
                    name: `E2E Actor ${stamp}`,
                    type: 'character',
                    system: { stats: { str: { value: 3 } } }
                }
            ]);
            await actor.createEmbeddedDocuments('ActiveEffect', [
                { name: 'Alpha Boost', disabled: false, img: 'icons/svg/aura.svg' },
                { name: 'Beta Shield', disabled: false, img: 'icons/svg/aura.svg' }
            ]);
            return actor.id;
        });

        const sheet = await openActorSheet(page, actorId);
        await clickActorSheetTab(sheet, 'effects');

        const rows = sheet.locator('.sla-effect-row');
        await expect(rows).toHaveCount(2);

        await sheet.locator('.sla-effect-search').fill('alpha');
        await expect(sheet.locator('.sla-effect-row:not(.sla-effect-filtered)')).toHaveCount(1);
        await expect(sheet.locator('.sla-effect-row:not(.sla-effect-filtered) h4')).toHaveText('Alpha Boost');

        await sheet.locator('.sla-effect-search').fill('');
        await expect(sheet.locator('.sla-effect-row:not(.sla-effect-filtered)')).toHaveCount(2);
    });

    test('character sheet — wound diagram reflects checked wounds', async ({ page }) => {
        const actorId = await createTestActor(page, {
            wounds: { head: true, torso: false, lArm: true }
        });
        const sheet = await openActorSheet(page, actorId);
        await clickActorSheetTab(sheet, 'combat');

        await expect(sheet.locator('.sla-wound-summary')).toBeVisible();
        await expect(sheet.locator('.sla-wound-diagram__slot[data-area="head"].is-wounded')).toBeVisible();
        await expect(sheet.locator('.sla-wound-diagram__slot[data-area="larm"].is-wounded')).toBeVisible();
        await expect(sheet.locator('.sla-wound-diagram__slot[data-area="torso"].is-wounded')).toHaveCount(0);
    });

    test('character sheet — tab rail exposes accessibility attributes', async ({ page }) => {
        const actorId = await createTestActor(page);
        const sheet = await openActorSheet(page, actorId);

        const tablist = sheet.locator('nav.sheet-tabs[role="tablist"]');
        await expect(tablist).toBeVisible();

        const mainTab = sheet.locator('nav.sheet-tabs a[data-tab="main"]');
        await expect(mainTab).toHaveAttribute('aria-selected', 'true');
        await expect(mainTab).toHaveAttribute('aria-controls', 'sla-tabpanel-main');

        await clickActorSheetTab(sheet, 'combat');
        await expect(sheet.locator('nav.sheet-tabs a[data-tab="combat"]')).toHaveAttribute('aria-selected', 'true');
        await expect(sheet.locator('nav.sheet-tabs a[data-tab="main"]')).toHaveAttribute('aria-selected', 'false');
    });

    test('character sheet — legacy biography tab id opens traits panel', async ({ page }) => {
        const actorId = await createTestActor(page);
        await openActorSheet(page, actorId);

        await page.evaluate(async (id) => {
            const actor = game.actors.get(id);
            const sheet = actor.sheet;
            await sheet.changeTab('biography', 'primary');
        }, actorId);

        const sheet = page.locator('form.application.sla-industries.actor').last();
        await expect(sheet.locator('.tab[data-tab="traits"]')).toHaveClass(/active/);
        await expect(sheet.locator('.sla-traits-panel')).toBeVisible();
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
