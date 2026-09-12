/**
 * E2E coverage for the roll orchestrators that weren't covered by
 * roll-math.mjs's pure-function unit tests: executeSkillRollFromItem
 * (skill-rolls.mjs), processExplosiveRoll (explosive-rolls.mjs, with
 * throw automation disabled to avoid needing a live canvas click), and
 * handleSheetRoll (sheet-rolls.mjs, the 4-way action dispatcher).
 */
const { test, expect } = require('@playwright/test');
const { joinGame, waitForSLASystem } = require('./fixtures');

const needsAuth = () => {
    test.skip(!process.env.FOUNDRY_USER, 'Set FOUNDRY_USER (and FOUNDRY_URL / FOUNDRY_PASSWORD if needed)');
};

test.describe('GM: executeSkillRollFromItem (document API)', () => {
    test.beforeEach(async ({ page }) => {
        needsAuth();
        await joinGame(page);
        await waitForSLASystem(page);
        const gm = await page.evaluate(() => game.user?.isGM === true);
        test.skip(!gm, 'Requires GM — use a Gamemaster account for FOUNDRY_USER');
    });

    test('posts a chat message for the item name when rolled', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([
                {
                    name: `E2E Skill Roll ${stamp}`,
                    type: 'character',
                    system: { stats: { know: { value: 4, bonus: 0 } } }
                }
            ]);
            const [skill] = await actor.createEmbeddedDocuments('Item', [
                { name: `E2E Perception ${stamp}`, type: 'skill', system: { rank: '2', stat: 'know' } }
            ]);

            const { generateSheetTooltip, resolveSheetDamageDisplay, buildSlaRollFlags } =
                await import('/systems/sla-industries/module/sheets/actor/sheet-helpers.mjs');
            const sheet = {
                actor,
                _generateTooltip: (roll, mod, sdMod) => generateSheetTooltip(roll, mod, sdMod),
                _resolveDamageDisplay: (formula) => resolveSheetDamageDisplay(formula, actor),
                _buildSlaRollFlags: (params) => buildSlaRollFlags(params)
            };

            const before = game.messages.size;
            const { executeSkillRollFromItem } =
                await import('/systems/sla-industries/module/sheets/actor/skill-rolls.mjs');
            await executeSkillRollFromItem(sheet, actor.items.get(skill.id));
            const after = game.messages.size;

            await actor.delete();
            return after > before;
        });

        expect(result).toBe(true);
    });
});

test.describe('GM: processExplosiveRoll (document API)', () => {
    test.beforeEach(async ({ page }) => {
        needsAuth();
        await joinGame(page);
        await waitForSLASystem(page);
        const gm = await page.evaluate(() => game.user?.isGM === true);
        test.skip(!gm, 'Requires GM — use a Gamemaster account for FOUNDRY_USER');
    });

    test('consumes one from the stack and deletes the item once depleted', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([{ name: `E2E Explosive ${stamp}`, type: 'character' }]);
            const [grenade] = await actor.createEmbeddedDocuments('Item', [
                {
                    name: `E2E Frag ${stamp}`,
                    type: 'explosive',
                    system: { quantity: 1, damage: '2d10', blastRadiusInner: 0, blastRadiusOuter: 5 }
                }
            ]);

            const original = game.settings.get('sla-industries', 'enableExplosiveThrowAutomation');
            await game.settings.set('sla-industries', 'enableExplosiveThrowAutomation', false);

            const { generateSheetTooltip, resolveSheetDamageDisplay } =
                await import('/systems/sla-industries/module/sheets/actor/sheet-helpers.mjs');
            const sheet = {
                actor,
                _generateTooltip: (roll, mod, sdMod) => generateSheetTooltip(roll, mod, sdMod),
                _resolveDamageDisplay: (formula) => resolveSheetDamageDisplay(formula, actor)
            };

            const form = document.createElement('form');

            const { processExplosiveRoll } =
                await import('/systems/sla-industries/module/sheets/actor/explosive-rolls.mjs');
            await processExplosiveRoll(sheet, grenade, form);

            await game.settings.set('sla-industries', 'enableExplosiveThrowAutomation', original);
            const stillExists = Boolean(game.actors.get(actor.id).items.get(grenade.id));
            await actor.delete();
            return stillExists;
        });

        expect(result).toBe(false);
    });
});

test.describe('GM: handleSheetRoll dispatch (document API)', () => {
    test.beforeEach(async ({ page }) => {
        needsAuth();
        await joinGame(page);
        await waitForSLASystem(page);
        const gm = await page.evaluate(() => game.user?.isGM === true);
        test.skip(!gm, 'Requires GM — use a Gamemaster account for FOUNDRY_USER');
    });

    test('routes rollType="stat" to executeStatRoll and posts a chat message', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([{ name: `E2E Sheet Roll Stat ${stamp}`, type: 'character' }]);

            const el = document.createElement('button');
            el.dataset.rollType = 'stat';
            el.dataset.key = 'str';

            const before = game.messages.size;
            const { handleSheetRoll } = await import('/systems/sla-industries/module/sheets/actor/sheet-rolls.mjs');
            await handleSheetRoll({ actor }, { preventDefault: () => {}, currentTarget: el });
            const after = game.messages.size;

            await actor.delete();
            return after > before;
        });

        expect(result).toBe(true);
    });

    test('does nothing for an unrecognized rollType', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([
                { name: `E2E Sheet Roll Unknown ${stamp}`, type: 'character' }
            ]);

            const el = document.createElement('button');
            el.dataset.rollType = 'not-a-real-type';

            const before = game.messages.size;
            const { handleSheetRoll } = await import('/systems/sla-industries/module/sheets/actor/sheet-rolls.mjs');
            await handleSheetRoll({ actor }, { preventDefault: () => {}, currentTarget: el });
            const after = game.messages.size;

            await actor.delete();
            return after - before;
        });

        expect(result).toBe(0);
    });
});
