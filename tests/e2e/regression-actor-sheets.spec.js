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

        // The HP bar lives in combat-tab.hbs (via wounds.hbs), not the default "main" tab —
        // confirmed live: .sla-hp-bar__fill has a real, non-empty bounding box only after
        // switching tabs (it's found-but-hidden beforehand, not simply slow to render).
        await clickActorSheetTab(sheet, 'combat');
        await expect(sheet.locator('.sla-hp-bar__fill.is-critical')).toBeVisible();
    });

    test('character sheet — LAD checkbox survives Edit/Play mode toggle (#348)', async ({ page }) => {
        const actorId = await createTestActor(page);
        const sheet = await openActorSheet(page, actorId);

        const ladCheckbox = sheet.locator('#lad-check');
        await ladCheckbox.check();
        await expect(ladCheckbox).toBeChecked();

        await sheet.locator('.sla-header-stat-switch').click();
        await expect(ladCheckbox).toBeChecked();

        await sheet.locator('.sla-header-stat-switch').click();
        await expect(ladCheckbox).toBeChecked();
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
        await expect(sheet.locator('.sla-wound-diagram__slot[data-wound="head"].is-wounded')).toBeVisible();
        await expect(sheet.locator('.sla-wound-diagram__slot[data-wound="lArm"].is-wounded')).toBeVisible();
        await expect(sheet.locator('.sla-wound-diagram__slot[data-wound="torso"].is-wounded')).toHaveCount(0);
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

    test('v14 ADD change type (type "add") increases core stat total', async ({ page }) => {
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
                            type: 'add',
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
                            type: 'add',
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

    test('issue #377: Threat sheet shows the AE-boosted stat total, not just the base value', async ({ page }) => {
        const actorId = await createTestActor(page, { stats: { str: { value: 3, bonus: 0 } } }, 'npc');
        const sheet = await openActorSheet(page, actorId);

        await page.evaluate(async (id) => {
            const actor = game.actors.get(id);
            await actor.createEmbeddedDocuments('ActiveEffect', [
                {
                    name: 'Gear STR Boost',
                    disabled: false,
                    changes: [
                        {
                            key: 'system.stats.str.bonus',
                            type: 'add',
                            value: 2
                        }
                    ]
                }
            ]);
            await actor.sheet.render(true);
        }, actorId);

        const strBaseInput = sheet.locator('input[name="system.stats.str.value"]');
        await expect(strBaseInput).toHaveValue('3');

        const strEffectiveHint = sheet.locator('.threat-row-effective td').first().locator('.sla-stat-effective-hint');
        await expect(strEffectiveHint).toBeVisible();
        await expect(strEffectiveHint).toHaveText(/5/);
    });

    test('issue #359: v14 SUBTRACT change type reduces the global roll modifier', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([
                {
                    name: `E2E Actor Subtract rollModifier ${stamp}`,
                    type: 'character',
                    system: {}
                }
            ]);
            await actor.createEmbeddedDocuments('ActiveEffect', [
                {
                    name: 'Drugged',
                    disabled: false,
                    changes: [
                        {
                            key: 'system.rollModifier.bonus',
                            type: 'subtract',
                            value: 2
                        }
                    ]
                }
            ]);
            const total = actor.system.rollModifier.total;
            await actor.delete();
            return total;
        });
        expect(result).toBe(-2);
    });

    test('v14 SUBTRACT change type also reduces a core stat total', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([
                {
                    name: `E2E Actor Subtract stat ${stamp}`,
                    type: 'character',
                    system: { stats: { str: { value: 3, bonus: 0 } } }
                }
            ]);
            await actor.createEmbeddedDocuments('ActiveEffect', [
                {
                    name: 'STR Penalty',
                    disabled: false,
                    changes: [
                        {
                            key: 'system.stats.str.bonus',
                            type: 'subtract',
                            value: 2
                        }
                    ]
                }
            ]);
            const total = actor.system.stats.str.total;
            await actor.delete();
            return total;
        });
        expect(result).toBe(1);
    });
});

test.describe('Trait items confer their Active Effects on grant/revoke (#363)', () => {
    test.beforeEach(async ({ page }) => {
        test.skip(!process.env.FOUNDRY_USER, 'Set FOUNDRY_USER');
        await joinGame(page);
        await waitForSLASystem(page);
        const gm = await page.evaluate(() => game.user?.isGM === true);
        test.skip(!gm, 'Requires GM — use a Gamemaster account for FOUNDRY_USER');
    });

    test('embedding a trait item on an actor applies its Active Effect; deleting the trait removes it', async ({
        page
    }) => {
        // The actor's SlaActor#_onCreateDescendantDocuments/_onDeleteDescendantDocuments hooks
        // that copy/remove a trait's effect are fire-and-forget (same convention as the existing
        // Species grant/remove handlers), so the actor.createEmbeddedDocuments('Item', ...)
        // promise below resolves before that copy necessarily finishes -- poll for the resulting
        // state instead of reading it synchronously right after (see LESSONS_LEARNED.md's note on
        // un-awaited side effects inside a resolved promise).
        const { actorId, traitUuid } = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([
                {
                    name: `E2E Trait Effect ${stamp}`,
                    type: 'character',
                    system: { stats: { str: { value: 3, bonus: 0 } } }
                }
            ]);

            // Build the trait as a world item first (its Effects tab configured before it's ever
            // dropped on anyone), then embed a copy on the actor -- mirroring the real drag-drop
            // flow (Item.implementation.fromDropData -> item.toObject() ->
            // actor.createEmbeddedDocuments('Item', [itemData])), so the trait's own effect
            // already exists at the moment it's granted.
            const [worldTrait] = await Item.createDocuments([
                { name: `E2E Natural Aptitude STR ${stamp}`, type: 'trait' }
            ]);
            await worldTrait.createEmbeddedDocuments('ActiveEffect', [
                {
                    name: 'Natural Aptitude: STR',
                    disabled: false,
                    changes: [{ key: 'system.stats.str.bonus', type: 'add', value: 1 }]
                }
            ]);
            const [trait] = await actor.createEmbeddedDocuments('Item', [worldTrait.toObject()]);
            await worldTrait.delete();

            return { actorId: actor.id, traitUuid: trait.uuid };
        });

        const readState = () =>
            page.evaluate(
                ({ actorId, traitUuid }) => {
                    const actor = game.actors.get(actorId);
                    return {
                        strTotal: actor.system.stats.str.total,
                        effectCount: actor.effects.filter((e) => e.origin === traitUuid).length
                    };
                },
                { actorId, traitUuid }
            );

        await expect.poll(readState).toEqual({ strTotal: 4, effectCount: 1 });

        await page.evaluate(
            ({ actorId, traitUuid }) => {
                const actor = game.actors.get(actorId);
                const trait = actor.items.find((i) => i.uuid === traitUuid);
                return trait.delete();
            },
            { actorId, traitUuid }
        );

        await expect.poll(readState).toEqual({ strTotal: 3, effectCount: 0 });

        await page.evaluate((id) => game.actors.get(id)?.delete(), actorId);
    });

    test('Gang Colours-style trait grants CHA/COOL stat bonuses and a flat HP Max bonus together', async ({ page }) => {
        const { actorId, traitUuid } = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([
                {
                    name: `E2E Gang Colours ${stamp}`,
                    type: 'character',
                    system: {
                        stats: {
                            str: { value: 0, bonus: 0 },
                            cha: { value: 2, bonus: 0 },
                            cool: { value: 2, bonus: 0 }
                        }
                    }
                }
            ]);

            const [worldTrait] = await Item.createDocuments([{ name: `E2E Gang Colours ${stamp}`, type: 'trait' }]);
            await worldTrait.createEmbeddedDocuments('ActiveEffect', [
                {
                    name: 'Gang Colours',
                    disabled: false,
                    changes: [
                        { key: 'system.stats.cha.bonus', type: 'add', value: 1 },
                        { key: 'system.stats.cool.bonus', type: 'add', value: 2 },
                        { key: 'system.hp.bonus', type: 'add', value: 5 }
                    ]
                }
            ]);
            const [trait] = await actor.createEmbeddedDocuments('Item', [worldTrait.toObject()]);
            await worldTrait.delete();

            return { actorId: actor.id, traitUuid: trait.uuid };
        });

        const readState = () =>
            page.evaluate((id) => {
                const actor = game.actors.get(id);
                return {
                    chaTotal: actor.system.stats.cha.total,
                    coolTotal: actor.system.stats.cool.total,
                    hpMax: actor.system.hp.max
                };
            }, actorId);

        // Base HP max for a character with no species item is hpBase (10, the actor.mjs fallback)
        // + STR total (0, unset here) + the Gang Colours hpBonus (5) = 15.
        await expect.poll(readState).toEqual({ chaTotal: 3, coolTotal: 4, hpMax: 15 });

        await page.evaluate(
            ({ actorId, traitUuid }) => {
                const actor = game.actors.get(actorId);
                return actor.items.find((i) => i.uuid === traitUuid).delete();
            },
            { actorId, traitUuid }
        );

        await expect.poll(readState).toEqual({ chaTotal: 2, coolTotal: 2, hpMax: 10 });

        await page.evaluate((id) => game.actors.get(id)?.delete(), actorId);
    });
});
