/**
 * E2E coverage for effect expiry on the real actor sheet and clock:
 * - the "used a drug in combat, then moved the clock" flow that stayed active (an effect created with a numeric
 *   duration gets Foundry's default `turnStart` expiry, which in combat waits for the owner's next turn),
 * - a duration typed in after the time had already passed,
 * - explicit expiry events and rounds durations staying under Foundry's control,
 * - how an expired effect looks on the Effects tab.
 *
 * Every test restores the world clock and removes its combat/actor in a `finally`.
 */
const { test, expect } = require('@playwright/test');
const {
    joinGame,
    waitForSLASystem,
    dismissFoundryNotifications,
    openActorSheet,
    clickActorSheetTab,
    closeApplicationWindows
} = require('./fixtures');

test.describe.configure({ timeout: 120_000 });

test.describe('GM: effect expiry', () => {
    test.beforeEach(async ({ page }) => {
        test.skip(!process.env.FOUNDRY_USER, 'Set FOUNDRY_USER');
        await joinGame(page);
        await waitForSLASystem(page);
        const gm = await page.evaluate(() => game.user?.isGM === true);
        test.skip(!gm, 'Requires GM — use a Gamemaster account for FOUNDRY_USER');
        await dismissFoundryNotifications(page);
    });

    /** Shared in-page helpers; returns a context object stored on window for the test's evaluate calls. */
    const setup = (page) =>
        page.evaluate(async () => {
            window.__t0 = game.time.worldTime;
            const [actor] = await Actor.createDocuments([
                {
                    name: `E2E Expiry ${Date.now()}`,
                    type: 'character',
                    system: { stats: { str: { value: 3, bonus: 0 } } }
                }
            ]);
            window.__actorId = actor.id;
            window.__cleanup = async () => {
                await game.combats.get(window.__combatId)?.delete();
                await game.time.set(window.__t0);
                await game.actors.get(window.__actorId)?.delete();
            };
            window.__wait = async (predicate, ms = 8000) => {
                const deadline = Date.now() + ms;
                while (Date.now() < deadline && !predicate()) await new Promise((r) => setTimeout(r, 100));
                return predicate();
            };
            window.__str = () => game.actors.get(window.__actorId).system.stats.str.total;
            const combat = await Combat.create({});
            window.__combatId = combat.id;
            await combat.createEmbeddedDocuments('Combatant', [{ actorId: actor.id }]);
            await combat.startCombat();
            for (let i = 0; i < 8; i++) await combat.nextRound();
            return actor.id;
        });

    test('a drug used in combat expires when the clock passes its length, even with the default turnStart expiry', async ({
        page
    }) => {
        await setup(page);
        try {
            const out = await page.evaluate(async () => {
                const actor = game.actors.get(window.__actorId);
                // Created WITH a numeric duration, so the schema fills in expiry "turnStart".
                const [created] = await actor.createEmbeddedDocuments('Item', [
                    {
                        name: 'E2E Combat Stim',
                        type: 'drug',
                        system: { quantity: 2 },
                        effects: [
                            {
                                name: 'E2E Combat Stim',
                                disabled: false,
                                duration: { value: 1, units: 'hours' },
                                changes: [{ key: 'system.stats.str.bonus', type: 'add', value: 2 }]
                            }
                        ]
                    }
                ]);
                const item = actor.items.get(created.id);
                const out = { itemExpiry: item.effects.contents[0].toObject().duration.expiry };
                const { useDrugItem } = await import('/systems/sla-industries/module/sheets/actor/item-actions.mjs');
                await useDrugItem({ actor }, item);
                await window.__wait(() => actor.effects.size === 1);
                const copy = () => game.actors.get(actor.id).effects.contents[0];
                out.copyExpiry = copy().toObject().duration.expiry;
                out.used = { str: window.__str(), expired: copy().toObject().duration.expired };

                await game.sla.advanceTime(8 * 3600);
                await window.__wait(() => copy()?.toObject().duration.expired === true);
                out.after = {
                    str: window.__str(),
                    expired: copy()?.toObject().duration.expired,
                    active: copy()?.active
                };
                return out;
            });
            expect(out.itemExpiry).toBe('turnStart');
            expect(out.copyExpiry).toBeNull();
            expect(out.used).toEqual({ str: 5, expired: false });
            expect(out.after).toEqual({ str: 3, expired: true, active: false });

            // What the GM sees: the copy is still listed, marked expired, not shown as "on".
            const sheet = await openActorSheet(page, await page.evaluate(() => window.__actorId));
            await clickActorSheetTab(sheet, 'effects');
            const row = sheet.locator('.sla-effect-row', { hasText: 'E2E Combat Stim' });
            await expect(row.locator('.sla-effect-expired-badge')).toBeVisible();
            await expect(row.locator('h4')).toHaveClass(/is-expired/);
            await expect(row.locator('.sla-effect-toggle i.fa-hourglass-end')).toBeVisible();
            await expect(row.locator('.sla-effect-toggle i.sla-effect-on')).toHaveCount(0);
            await expect(row.locator('.sla-effect-source')).toHaveText('E2E Combat Stim');
        } finally {
            await closeApplicationWindows(page);
            await page.evaluate(() => window.__cleanup());
        }
    });

    test('a used-up drug (item deleted) has its expired copy removed, and until then it reads as the drug, not Unknown', async ({
        page
    }) => {
        await setup(page);
        try {
            const out = await page.evaluate(async () => {
                const actor = game.actors.get(window.__actorId);
                const [created] = await actor.createEmbeddedDocuments('Item', [
                    {
                        name: 'E2E Last Dose',
                        type: 'drug',
                        system: { quantity: 1 },
                        effects: [
                            {
                                name: 'E2E Last Dose',
                                disabled: false,
                                duration: { value: 1, units: 'hours' },
                                changes: [{ key: 'system.stats.str.bonus', type: 'add', value: 2 }]
                            }
                        ]
                    }
                ]);
                const { useDrugItem } = await import('/systems/sla-industries/module/sheets/actor/item-actions.mjs');
                await useDrugItem({ actor }, actor.items.get(created.id));
                await window.__wait(() => actor.effects.size === 1 && !actor.items.get(created.id));
                const copy = game.actors.get(actor.id).effects.contents[0];
                const out = {
                    itemGone: !actor.items.get(created.id),
                    stampedName: copy.getFlag('sla-industries', 'sourceName')
                };
                await game.sla.advanceTime(8 * 3600);
                out.removed = await window.__wait(() => game.actors.get(actor.id).effects.size === 0);
                out.str = window.__str();
                return out;
            });
            expect(out).toEqual({ itemGone: true, stampedName: 'E2E Last Dose', removed: true, str: 3 });
        } finally {
            await page.evaluate(() => window.__cleanup());
        }
    });

    test('a duration typed in after the time has already passed expires at once, with no further clock change', async ({
        page
    }) => {
        await setup(page);
        try {
            const out = await page.evaluate(async () => {
                const actor = game.actors.get(window.__actorId);
                const [effect] = await actor.createEmbeddedDocuments('ActiveEffect', [
                    {
                        name: 'E2E Late',
                        disabled: false,
                        changes: [{ key: 'system.stats.str.bonus', type: 'add', value: 2 }]
                    }
                ]);
                await game.sla.advanceTime(8 * 3600);
                const before = window.__str();
                await actor.effects.get(effect.id).update({ 'duration.value': 1, 'duration.units': 'hours' });
                // The stored flag, not just the live STR total: the live check already zeroes an overdue bonus.
                const recorded = await window.__wait(
                    () => game.actors.get(actor.id).effects.get(effect.id)?.toObject().duration.expired === true
                );
                return { before, recorded, after: window.__str() };
            });
            expect(out).toEqual({ before: 5, recorded: true, after: 3 });
        } finally {
            await page.evaluate(() => window.__cleanup());
        }
    });

    test('an explicit expiry event and a rounds duration are left to Foundry, not expired by the clock', async ({
        page
    }) => {
        await setup(page);
        try {
            const out = await page.evaluate(async () => {
                const actor = game.actors.get(window.__actorId);
                await actor.createEmbeddedDocuments('ActiveEffect', [
                    {
                        name: 'E2E TurnEnd',
                        disabled: false,
                        duration: { value: 1, units: 'hours', expiry: 'turnEnd' },
                        changes: [{ key: 'system.stats.str.bonus', type: 'add', value: 1 }]
                    },
                    {
                        name: 'E2E Rounds',
                        disabled: false,
                        duration: { value: 3, units: 'rounds' },
                        changes: [{ key: 'system.stats.str.bonus', type: 'add', value: 1 }]
                    }
                ]);
                const before = window.__str();
                await game.sla.advanceTime(8 * 3600);
                await new Promise((r) => setTimeout(r, 2500));
                const expired = Object.fromEntries(
                    game.actors.get(actor.id).effects.map((e) => [e.name, e.toObject().duration.expired])
                );
                return { before, after: window.__str(), expired };
            });
            expect(out.before).toBe(5);
            expect(out.expired['E2E TurnEnd']).toBe(false);
            expect(out.expired['E2E Rounds']).toBe(false);
            expect(out.after).toBe(5);
        } finally {
            await page.evaluate(() => window.__cleanup());
        }
    });
});
