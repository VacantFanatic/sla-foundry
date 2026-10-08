/**
 * E2E coverage for effect durations driven by the game clock and by combat:
 * game.sla.advanceTime / the GM clock window, the secondsPerRound setting, rounds / turns / end-of-combat
 * item durations, and a drug switching itself off once all its timed effects have expired.
 *
 * Every test that moves the world clock restores it in a `finally`, and restores any setting it changes.
 */
const { test, expect } = require('@playwright/test');
const { joinGame, waitForSLASystem, dismissFoundryNotifications } = require('./fixtures');

test.describe.configure({ timeout: 90_000 });

test.describe('GM: game clock and effect durations', () => {
    test.beforeEach(async ({ page }) => {
        test.skip(!process.env.FOUNDRY_USER, 'Set FOUNDRY_USER');
        await joinGame(page);
        await waitForSLASystem(page);
        const gm = await page.evaluate(() => game.user?.isGM === true);
        test.skip(!gm, 'Requires GM — use a Gamemaster account for FOUNDRY_USER');
        await dismissFoundryNotifications(page);
    });

    test('game.sla.advanceTime moves the clock, rewinds, and rejects bad amounts', async ({ page }) => {
        const out = await page.evaluate(async () => {
            const t0 = game.time.worldTime;
            const out = { t0 };
            try {
                out.returned = await game.sla.advanceTime(90);
                out.afterAdvance = game.time.worldTime - t0;
                await game.sla.advanceTime(-90);
                out.afterRewind = game.time.worldTime - t0;
                out.zero = await game.sla.advanceTime(0);
                out.text = await game.sla.advanceTime('abc');
                out.unchanged = game.time.worldTime - t0;
            } finally {
                await game.time.set(t0);
            }
            return out;
        });
        expect(out.returned).toBe(out.t0 + 90);
        expect(out.afterAdvance).toBe(90);
        expect(out.afterRewind).toBe(0);
        expect(out.zero).toBeNull();
        expect(out.text).toBeNull();
        expect(out.unchanged).toBe(0);
    });

    test('the scene-controls clock button opens a window whose presets move the real clock', async ({ page }) => {
        const t0 = await page.evaluate(() => game.time.worldTime);
        try {
            const tool = page.locator('button[data-action="tool"][data-tool="slaGameClock"]');
            await expect(tool).toBeVisible();
            await tool.click();

            const win = page.locator('#sla-game-clock');
            await expect(win).toBeVisible();
            const readTime = () => win.locator('.sla-game-clock-time').innerText();
            const before = await readTime();

            await win.locator('button[data-preset="hour1"][data-seconds="3600"]').click();
            await expect.poll(() => page.evaluate(() => game.time.worldTime)).toBe(t0 + 3600);
            await expect.poll(readTime).not.toBe(before);

            await win.locator('button[data-preset="hour1"][data-seconds="-3600"]').click();
            await expect.poll(() => page.evaluate(() => game.time.worldTime)).toBe(t0);
            await expect.poll(readTime).toBe(before);
        } finally {
            await page.evaluate(async (t) => game.time.set(t), t0);
            await page.evaluate(() => foundry.applications.instances.get('sla-game-clock')?.close());
        }
    });

    test('a rounds duration used outside combat counts down on the clock; with round length 0 it ends the next time the clock moves', async ({
        page
    }) => {
        const out = await page.evaluate(async () => {
            const t0 = game.time.worldTime;
            const original = game.settings.get('sla-industries', 'secondsPerRound');
            const [actor] = await Actor.createDocuments([
                {
                    name: `E2E Rounds ${Date.now()}`,
                    type: 'character',
                    system: { stats: { str: { value: 3, bonus: 0 } } }
                }
            ]);
            const waitFor = async (predicate) => {
                const deadline = Date.now() + 8000;
                while (Date.now() < deadline && !predicate()) await new Promise((r) => setTimeout(r, 100));
                return predicate();
            };
            const effect = () => game.actors.get(actor.id).effects.contents[0];
            const make = async (name) => {
                const [created] = await actor.createEmbeddedDocuments('Item', [
                    {
                        name,
                        type: 'drug',
                        system: { duration: '3 rounds' },
                        effects: [
                            {
                                name: `${name} boost`,
                                disabled: false,
                                changes: [{ key: 'system.stats.str.bonus', type: 'add', value: 2 }]
                            }
                        ]
                    }
                ]);
                return actor.items.get(created.id);
            };
            const out = {};
            try {
                await game.settings.set('sla-industries', 'secondsPerRound', 6);
                const timed = await make('Timed Stim');
                await timed.toggleActive();
                out.six = {
                    units: effect().toObject().duration.units,
                    temporary: effect().isTemporary,
                    str: game.actors.get(actor.id).system.stats.str.total
                };
                await game.time.advance(18);
                out.sixExpired = await waitFor(() => effect()?.duration.expired === true);
                await timed.update({ 'system.active': false });
                await waitFor(() => game.actors.get(actor.id).effects.size === 0);

                await game.settings.set('sla-industries', 'secondsPerRound', 0);
                const open = await make('Open Stim');
                await open.toggleActive();
                const read = () => ({
                    expired: effect().duration.expired,
                    str: game.actors.get(actor.id).system.stats.str.total
                });
                out.zeroBefore = read();
                // With no round length and no combat, core cannot convert rounds to time, so the effect
                // ends the next time the clock moves at all.
                await game.time.advance(1);
                await waitFor(() => effect()?.duration.expired === true);
                out.zeroAfter = read();
            } catch (error) {
                out.error = String(error?.stack ?? error);
            } finally {
                await game.settings.set('sla-industries', 'secondsPerRound', original);
                await game.time.set(t0);
                await actor.delete();
            }
            return out;
        });
        expect(out.error, JSON.stringify(out)).toBeUndefined();
        expect(out.six).toEqual({ units: 'rounds', temporary: true, str: 5 });
        expect(out.sixExpired).toBe(true);
        expect(out.zeroBefore).toEqual({ expired: false, str: 5 });
        expect(out.zeroAfter).toEqual({ expired: true, str: 3 });
    });

    test('a rounds duration used in a running combat expires after that many rounds, and combat moves the clock', async ({
        page
    }) => {
        const out = await page.evaluate(async () => {
            const t0 = game.time.worldTime;
            const original = game.settings.get('sla-industries', 'secondsPerRound');
            const [actor] = await Actor.createDocuments([
                {
                    name: `E2E Combat Rounds ${Date.now()}`,
                    type: 'character',
                    system: { stats: { str: { value: 3, bonus: 0 } } }
                }
            ]);
            const waitFor = async (predicate) => {
                const deadline = Date.now() + 8000;
                while (Date.now() < deadline && !predicate()) await new Promise((r) => setTimeout(r, 100));
                return predicate();
            };
            const effect = () => game.actors.get(actor.id).effects.contents[0];
            let combat;
            const out = {};
            try {
                await game.settings.set('sla-industries', 'secondsPerRound', 6);
                combat = await Combat.create({});
                await combat.createEmbeddedDocuments('Combatant', [{ actorId: actor.id }]);
                await combat.startCombat();
                const [created] = await actor.createEmbeddedDocuments('Item', [
                    {
                        name: 'Combat Stim',
                        type: 'drug',
                        system: { duration: '3 rounds' },
                        effects: [
                            {
                                name: 'Combat boost',
                                disabled: false,
                                changes: [{ key: 'system.stats.str.bonus', type: 'add', value: 2 }]
                            }
                        ]
                    }
                ]);
                await actor.items.get(created.id).toggleActive();
                const clockAtUse = game.time.worldTime;
                out.start = {
                    round: effect().start.round,
                    combatSet: !!effect().start.combat,
                    expired: effect().duration.expired
                };

                await combat.nextRound();
                await combat.nextRound();
                await new Promise((r) => setTimeout(r, 500));
                out.afterTwo = {
                    expired: effect().duration.expired,
                    remaining: effect().duration.remaining,
                    str: game.actors.get(actor.id).system.stats.str.total
                };

                await combat.nextRound();
                out.expired = await waitFor(() => effect()?.duration.expired === true || !effect());
                out.clockMoved = game.time.worldTime - clockAtUse;
            } finally {
                await game.settings.set('sla-industries', 'secondsPerRound', original);
                await combat?.delete();
                await game.time.set(t0);
                await actor.delete();
            }
            return out;
        });
        expect(out.start).toEqual({ round: 1, combatSet: true, expired: false });
        expect(out.afterTwo).toEqual({ expired: false, remaining: 1, str: 5 });
        expect(out.expired).toBe(true);
        expect(out.clockMoved).toBe(18);
    });

    test('a "Scene" duration expires when the combat ends', async ({ page }) => {
        const out = await page.evaluate(async () => {
            const t0 = game.time.worldTime;
            const [actor] = await Actor.createDocuments([
                {
                    name: `E2E Scene ${Date.now()}`,
                    type: 'character',
                    system: { stats: { str: { value: 3, bonus: 0 } } }
                }
            ]);
            const waitFor = async (predicate) => {
                const deadline = Date.now() + 8000;
                while (Date.now() < deadline && !predicate()) await new Promise((r) => setTimeout(r, 100));
                return predicate();
            };
            const effect = () => game.actors.get(actor.id).effects.contents[0];
            let combat;
            const out = {};
            try {
                combat = await Combat.create({});
                await combat.createEmbeddedDocuments('Combatant', [{ actorId: actor.id }]);
                await combat.startCombat();
                const [created] = await actor.createEmbeddedDocuments('Item', [
                    {
                        name: 'Scene Stim',
                        type: 'drug',
                        system: { duration: 'Scene' },
                        effects: [
                            {
                                name: 'Scene boost',
                                disabled: false,
                                changes: [{ key: 'system.stats.str.bonus', type: 'add', value: 2 }]
                            }
                        ]
                    }
                ]);
                await actor.items.get(created.id).toggleActive();
                out.during = {
                    expiry: effect().duration.expiry,
                    temporary: effect().isTemporary,
                    expired: effect().duration.expired,
                    str: game.actors.get(actor.id).system.stats.str.total
                };
                await combat.delete();
                combat = null;
                out.expired = await waitFor(() => effect()?.duration.expired === true || !effect());
            } finally {
                await combat?.delete();
                await game.time.set(t0);
                await actor.delete();
            }
            return out;
        });
        expect(out.during).toEqual({ expiry: 'combatEnd', temporary: true, expired: false, str: 5 });
        expect(out.expired).toBe(true);
    });

    test('a drug switches itself off and drops its expired copies only once ALL its timed effects have expired', async ({
        page
    }) => {
        const out = await page.evaluate(async () => {
            const t0 = game.time.worldTime;
            const [actor] = await Actor.createDocuments([
                {
                    name: `E2E Switch Off ${Date.now()}`,
                    type: 'character',
                    system: { stats: { str: { value: 3, bonus: 0 } } }
                }
            ]);
            const waitFor = async (predicate, ms = 8000) => {
                const deadline = Date.now() + ms;
                while (Date.now() < deadline && !predicate()) await new Promise((r) => setTimeout(r, 100));
                return predicate();
            };
            const live = () => game.actors.get(actor.id);
            const out = {};
            try {
                const [created] = await actor.createEmbeddedDocuments('Item', [
                    {
                        name: 'Two Stage Stim',
                        type: 'drug',
                        system: { duration: '' },
                        effects: [
                            {
                                name: 'Short',
                                disabled: false,
                                duration: { value: 1, units: 'hours' },
                                changes: [{ key: 'system.stats.str.bonus', type: 'add', value: 1 }]
                            },
                            {
                                name: 'Long',
                                disabled: false,
                                duration: { value: 4, units: 'hours' },
                                changes: [{ key: 'system.stats.str.bonus', type: 'add', value: 2 }]
                            }
                        ]
                    }
                ]);
                const drug = actor.items.get(created.id);
                await drug.toggleActive();
                out.used = { copies: live().effects.size, str: live().system.stats.str.total };
                await game.time.advance(3601);
                await waitFor(() => live().effects.find((e) => e.name === 'Short')?.duration.expired === true);
                await new Promise((r) => setTimeout(r, 1000));
                out.afterOneHour = {
                    active: drug.system.active,
                    copies: live().effects.size,
                    str: live().system.stats.str.total
                };

                await game.time.advance(3 * 3600);
                out.switchedOff = await waitFor(() => drug.system.active === false);
                await waitFor(() => live().effects.size === 0);
                out.end = {
                    active: drug.system.active,
                    copies: live().effects.size,
                    str: live().system.stats.str.total
                };
            } finally {
                await game.time.set(t0);
                await actor.delete();
            }
            return out;
        });
        expect(out.used).toEqual({ copies: 2, str: 6 });
        expect(out.afterOneHour).toEqual({ active: true, copies: 2, str: 5 });
        expect(out.switchedOff).toBe(true);
        expect(out.end).toEqual({ active: false, copies: 0, str: 3 });
    });
});
