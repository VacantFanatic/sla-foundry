/**
 * E2E coverage for module/sheets/actor/weapon-gates.mjs's gating and
 * damage-roll-assembly functions that weren't covered by the pure-function
 * unit tests: canProceedWithWeaponAttack, resolveRangedAttackContext, and
 * executeCombatLoadoutDamageRoll (the inventory-row quick-damage-roll entry
 * point, which assembles the final formula/AD/PV from real actor+item state).
 */
const { test, expect } = require('@playwright/test');
const { joinGame, waitForSLASystem } = require('./fixtures');

const needsAuth = () => {
    test.skip(!process.env.FOUNDRY_USER, 'Set FOUNDRY_USER (and FOUNDRY_URL / FOUNDRY_PASSWORD if needed)');
};

test.describe('GM: canProceedWithWeaponAttack / resolveRangedAttackContext (document API)', () => {
    test.beforeEach(async ({ page }) => {
        needsAuth();
        await joinGame(page);
        await waitForSLASystem(page);
        const gm = await page.evaluate(() => game.user?.isGM === true);
        test.skip(!gm, 'Requires GM — use a Gamemaster account for FOUNDRY_USER');
    });

    test('blocks a character attacking with an unequipped weapon', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([{ name: `E2E Gate Character ${stamp}`, type: 'character' }]);
            const [weapon] = await actor.createEmbeddedDocuments('Item', [
                { name: `E2E Unequipped Gun ${stamp}`, type: 'weapon', system: { equipped: false } }
            ]);

            const { canProceedWithWeaponAttack } =
                await import('/systems/sla-industries/module/sheets/actor/weapon-gates.mjs');
            const proceeded = canProceedWithWeaponAttack({ actor }, weapon);
            await actor.delete();
            return proceeded;
        });

        expect(result).toBe(false);
    });

    test('does not require equip for an NPC (Threat) actor', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([{ name: `E2E Gate NPC ${stamp}`, type: 'npc' }]);
            const [weapon] = await actor.createEmbeddedDocuments('Item', [
                { name: `E2E NPC Gun ${stamp}`, type: 'weapon', system: { equipped: false } }
            ]);

            const { canProceedWithWeaponAttack } =
                await import('/systems/sla-industries/module/sheets/actor/weapon-gates.mjs');
            const proceeded = canProceedWithWeaponAttack({ actor }, weapon);
            await actor.delete();
            return proceeded;
        });

        expect(result).toBe(true);
    });

    test('resolveRangedAttackContext short-circuits for melee weapons and when no target is selected', async ({
        page
    }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([{ name: `E2E Range Context ${stamp}`, type: 'character' }]);
            const [weapon] = await actor.createEmbeddedDocuments('Item', [
                { name: `E2E Range Gun ${stamp}`, type: 'weapon', system: { range: '30m' } }
            ]);

            const { resolveRangedAttackContext } =
                await import('/systems/sla-industries/module/sheets/actor/weapon-gates.mjs');
            const meleeContext = resolveRangedAttackContext({ actor }, weapon, true);
            const noTargetContext = resolveRangedAttackContext({ actor }, weapon, false);

            await actor.delete();
            return { meleeContext, noTargetContext };
        });

        expect(result.meleeContext).toEqual({ isLongRange: false, rangePenaltyMsg: '' });
        expect(result.noTargetContext).toEqual({ isLongRange: false, rangePenaltyMsg: '' });
    });
});

test.describe('GM: executeCombatLoadoutDamageRoll (document API)', () => {
    test.beforeEach(async ({ page }) => {
        needsAuth();
        await joinGame(page);
        await waitForSLASystem(page);
        const gm = await page.evaluate(() => game.user?.isGM === true);
        test.skip(!gm, 'Requires GM — use a Gamemaster account for FOUNDRY_USER');
    });

    test('assembles a melee weapon formula with STR and ammo modifiers applied', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([
                {
                    name: `E2E Loadout Melee ${stamp}`,
                    type: 'character',
                    system: { stats: { str: { value: 6, bonus: 0 } } }
                }
            ]);
            const [weapon] = await actor.createEmbeddedDocuments('Item', [
                {
                    name: `E2E Vibro Blade ${stamp}`,
                    type: 'weapon',
                    system: { attackType: 'melee', damage: '1d10', ad: 2, equipped: true, ammoType: 'he' }
                }
            ]);

            const row = document.createElement('div');
            row.className = 'item';
            row.dataset.itemId = weapon.id;
            const anchor = document.createElement('button');
            row.appendChild(anchor);

            const { SLAChat } = await import('/systems/sla-industries/module/helpers/chat.mjs');
            let captured = null;
            const original = SLAChat.executeStandardDamageRoll;
            SLAChat.executeStandardDamageRoll = async (opts) => {
                captured = opts;
            };

            const { executeCombatLoadoutDamageRoll } =
                await import('/systems/sla-industries/module/sheets/actor/weapon-gates.mjs');
            await executeCombatLoadoutDamageRoll({ actor }, anchor);

            SLAChat.executeStandardDamageRoll = original;
            await actor.delete();
            return captured
                ? { rollFormula: captured.rollFormula, adValue: captured.adValue, pvMod: captured.pvMod }
                : null;
        });

        // STR 6 -> +2 melee damage mod; HE ammo -> +1 damage, +1 AD, +0 PV (module/config.mjs).
        expect(result).not.toBeNull();
        expect(result.rollFormula).toBe('1d10 + 3');
        expect(result.adValue).toBe(3);
        expect(result.pvMod).toBe(0);
    });

    test('assembles an explosive formula using flat system.ad, no ammo modifiers', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([
                { name: `E2E Loadout Explosive ${stamp}`, type: 'character' }
            ]);
            const [explosive] = await actor.createEmbeddedDocuments('Item', [
                { name: `E2E Frag Grenade ${stamp}`, type: 'explosive', system: { damage: '2d10', ad: 4 } }
            ]);

            const row = document.createElement('div');
            row.className = 'item';
            row.dataset.itemId = explosive.id;
            const anchor = document.createElement('button');
            row.appendChild(anchor);

            const { SLAChat } = await import('/systems/sla-industries/module/helpers/chat.mjs');
            let captured = null;
            const original = SLAChat.executeStandardDamageRoll;
            SLAChat.executeStandardDamageRoll = async (opts) => {
                captured = opts;
            };

            const { executeCombatLoadoutDamageRoll } =
                await import('/systems/sla-industries/module/sheets/actor/weapon-gates.mjs');
            await executeCombatLoadoutDamageRoll({ actor }, anchor);

            SLAChat.executeStandardDamageRoll = original;
            await actor.delete();
            return captured ? { rollFormula: captured.rollFormula, adValue: captured.adValue } : null;
        });

        expect(result).not.toBeNull();
        expect(result.rollFormula).toBe('2d10');
        expect(result.adValue).toBe(4);
    });
});
