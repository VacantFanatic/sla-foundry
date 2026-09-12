/**
 * E2E coverage for the Foundry-dependent exports in
 * module/sheets/actor/sheet-helpers.mjs that aren't thin one-line
 * delegations to already-unit-tested roll-math.mjs functions:
 * resolveSheetDamageDisplay (Roll.replaceFormulaData + dynamic eval),
 * resolveCombatSkillRank (real actor item lookup), and applyHeadshotSideEffect
 * (writes system.wounds.head on a targeted actor).
 */
const { test, expect } = require('@playwright/test');
const { joinGame, waitForSLASystem } = require('./fixtures');

const needsAuth = () => {
    test.skip(!process.env.FOUNDRY_USER, 'Set FOUNDRY_USER (and FOUNDRY_URL / FOUNDRY_PASSWORD if needed)');
};

test.describe('GM: resolveSheetDamageDisplay / resolveCombatSkillRank / applyHeadshotSideEffect (document API)', () => {
    test.beforeEach(async ({ page }) => {
        needsAuth();
        await joinGame(page);
        await waitForSLASystem(page);
        const gm = await page.evaluate(() => game.user?.isGM === true);
        test.skip(!gm, 'Requires GM — use a Gamemaster account for FOUNDRY_USER');
    });

    test('resolveSheetDamageDisplay resolves a flat-value formula and passes dice formulas through', async ({
        page
    }) => {
        const result = await page.evaluate(async () => {
            const { resolveSheetDamageDisplay } =
                await import('/systems/sla-industries/module/sheets/actor/sheet-helpers.mjs');
            return {
                empty: resolveSheetDamageDisplay('', null),
                zero: resolveSheetDamageDisplay('0', null),
                dice: resolveSheetDamageDisplay('2d10 + 3', null),
                flatMath: resolveSheetDamageDisplay('2 + 3', null),
                negativeClampedToZero: resolveSheetDamageDisplay('1 - 5', null),
                invalidExpression: resolveSheetDamageDisplay('this is not a formula', null)
            };
        });

        expect(result.empty).toBe('0');
        expect(result.zero).toBe('0');
        expect(result.dice).toBe('2d10 + 3');
        expect(result.flatMath).toBe('5');
        expect(result.negativeClampedToZero).toBe('0');
        expect(result.invalidExpression).toBe('this is not a formula');
    });

    test('resolveCombatSkillRank looks up rank by CONFIG display name and by raw skill key, case-insensitively', async ({
        page
    }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([{ name: `E2E Skill Rank ${stamp}`, type: 'character' }]);
            await actor.createEmbeddedDocuments('Item', [
                { name: 'pistol', type: 'skill', system: { rank: '3' } },
                { name: 'Rifle', type: 'skill', system: { rank: '2' } }
            ]);

            const { resolveCombatSkillRank } =
                await import('/systems/sla-industries/module/sheets/actor/sheet-helpers.mjs');
            // CONFIG.SLA.combatSkills.pistol === 'Pistol', but the actor's item is literally named
            // 'pistol' -- the lookup is case-insensitive, so the raw key still resolves.
            const byRawKeyCaseInsensitive = resolveCombatSkillRank(actor, 'pistol');
            const byDisplayName = resolveCombatSkillRank(actor, 'rifle');
            const missing = resolveCombatSkillRank(actor, 'throw');
            const empty = resolveCombatSkillRank(actor, '');

            await actor.delete();
            return { byRawKeyCaseInsensitive, byDisplayName, missing, empty };
        });

        expect(result.byRawKeyCaseInsensitive).toBe(3);
        expect(result.byDisplayName).toBe(2);
        expect(result.missing).toBe(0);
        expect(result.empty).toBe(0);
    });

    test('applyHeadshotSideEffect is a no-op when no target is selected', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const { applyHeadshotSideEffect } =
                await import('/systems/sla-industries/module/sheets/actor/sheet-helpers.mjs');
            const notes = [];
            await applyHeadshotSideEffect(notes);
            return notes;
        });

        expect(result).toEqual([]);
    });
});
