/**
 * E2E coverage for module/sheets/actor/weapon-rolls.mjs::processWeaponRoll --
 * the core attack-roll orchestrator. Its calculation pieces were already
 * extracted and unit-tested (roll-math.mjs, weapon-gates-pure.mjs); this
 * session additionally extracted the remaining inline pure logic (aim-limit
 * validation + prone/stunned/aim modifier application) into
 * roll-math.mjs::applyWeaponAimAndConditionMods (see its own unit tests).
 *
 * This test calls the real orchestrator directly with a sheet stub whose
 * methods all delegate to the same already-tested functions the real
 * SlaActorSheet class delegates to (see module/sheets/actor-sheet.mjs) --
 * not a mock of the logic, just a stand-in for the ApplicationV2 instance
 * itself, which processWeaponRoll doesn't otherwise need.
 */
const { test, expect } = require('@playwright/test');
const { joinGame, waitForSLASystem } = require('./fixtures');

const needsAuth = () => {
    test.skip(!process.env.FOUNDRY_USER, 'Set FOUNDRY_USER (and FOUNDRY_URL / FOUNDRY_PASSWORD if needed)');
};

test.describe('GM: processWeaponRoll (document API)', () => {
    test.beforeEach(async ({ page }) => {
        needsAuth();
        await joinGame(page);
        await waitForSLASystem(page);
        const gm = await page.evaluate(() => game.user?.isGM === true);
        test.skip(!gm, 'Requires GM — use a Gamemaster account for FOUNDRY_USER');
    });

    test('completes a melee attack roll and posts a chat message', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([
                { name: `E2E Weapon Roll Melee ${stamp}`, type: 'character', system: { stats: { str: { value: 5 } } } }
            ]);
            const [weapon] = await actor.createEmbeddedDocuments('Item', [
                {
                    name: `E2E Melee Weapon ${stamp}`,
                    type: 'weapon',
                    system: { attackType: 'melee', skill: 'melee', damage: '1d10', equipped: true }
                }
            ]);

            const form = document.createElement('form');
            form.innerHTML = `
                <input name="modifier" value="0">
                <input name="aim_sd" value="0">
                <input name="aim_auto" value="0">
                <input name="combatDef" value="0">
                <input name="acroDef" value="0">
                <input type="checkbox" name="prone">
                <input type="checkbox" name="charging">
                <input type="checkbox" name="targetCharged">
                <input type="checkbox" name="sameTarget">
                <input type="checkbox" name="breakOff">
                <input type="checkbox" name="natural">
                <input name="reservedDice" value="0">
            `;

            const { canProceedWithWeaponAttack, resolveRangedAttackContext } =
                await import('/systems/sla-industries/module/sheets/actor/weapon-gates.mjs');
            const { resolveCombatSkillRank, generateSheetTooltip, resolveSheetDamageDisplay, buildSlaRollFlags } =
                await import('/systems/sla-industries/module/sheets/actor/sheet-helpers.mjs');
            const { applyMeleeModifiers, applyRangedModifiers } =
                await import('/systems/sla-industries/module/helpers/modifiers.mjs');

            const sheet = { actor };
            sheet._canProceedWithWeaponAttack = (item, opts) => canProceedWithWeaponAttack(sheet, item, opts);
            sheet._resolveCombatSkillRank = (skillInput) => resolveCombatSkillRank(actor, skillInput);
            sheet._resolveRangedAttackContext = (item, isMelee) => resolveRangedAttackContext(sheet, item, isMelee);
            sheet._applyMeleeModifiers = (form, strValue, mods) => applyMeleeModifiers(form, strValue, mods);
            sheet._applyRangedModifiers = (item, form, mods, notes, flags, options) =>
                applyRangedModifiers(item, form, mods, notes, flags, options);
            sheet._generateTooltip = (roll, mod, sdMod) => generateSheetTooltip(roll, mod, sdMod);
            sheet._resolveDamageDisplay = (formula) => resolveSheetDamageDisplay(formula, actor);
            sheet._buildSlaRollFlags = (params) => buildSlaRollFlags(params);

            const before = game.messages.size;
            const { processWeaponRoll } = await import('/systems/sla-industries/module/sheets/actor/weapon-rolls.mjs');
            await processWeaponRoll(sheet, weapon, form, true);
            const after = game.messages.size;

            await actor.delete();
            return after > before;
        });

        expect(result).toBe(true);
    });

    test('refuses the roll and posts nothing when total aim exceeds skill rank', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([
                { name: `E2E Weapon Roll AimLimit ${stamp}`, type: 'character' }
            ]);
            const [weapon] = await actor.createEmbeddedDocuments('Item', [
                {
                    name: `E2E Aim Weapon ${stamp}`,
                    type: 'weapon',
                    system: { attackType: 'melee', skill: 'melee', damage: '1d10', equipped: true }
                }
            ]);
            // No "melee" skill item on the actor -> resolveCombatSkillRank returns rank 0,
            // so any positive aim total exceeds it.
            const form = document.createElement('form');
            form.innerHTML = `
                <input name="modifier" value="0">
                <input name="aim_sd" value="1">
                <input name="aim_auto" value="0">
                <input name="combatDef" value="0">
                <input name="acroDef" value="0">
            `;

            const { canProceedWithWeaponAttack, resolveRangedAttackContext } =
                await import('/systems/sla-industries/module/sheets/actor/weapon-gates.mjs');
            const { resolveCombatSkillRank, generateSheetTooltip, resolveSheetDamageDisplay, buildSlaRollFlags } =
                await import('/systems/sla-industries/module/sheets/actor/sheet-helpers.mjs');
            const { applyMeleeModifiers, applyRangedModifiers } =
                await import('/systems/sla-industries/module/helpers/modifiers.mjs');

            const sheet = { actor };
            sheet._canProceedWithWeaponAttack = (item, opts) => canProceedWithWeaponAttack(sheet, item, opts);
            sheet._resolveCombatSkillRank = (skillInput) => resolveCombatSkillRank(actor, skillInput);
            sheet._resolveRangedAttackContext = (item, isMelee) => resolveRangedAttackContext(sheet, item, isMelee);
            sheet._applyMeleeModifiers = (form, strValue, mods) => applyMeleeModifiers(form, strValue, mods);
            sheet._applyRangedModifiers = (item, form, mods, notes, flags, options) =>
                applyRangedModifiers(item, form, mods, notes, flags, options);
            sheet._generateTooltip = (roll, mod, sdMod) => generateSheetTooltip(roll, mod, sdMod);
            sheet._resolveDamageDisplay = (formula) => resolveSheetDamageDisplay(formula, actor);
            sheet._buildSlaRollFlags = (params) => buildSlaRollFlags(params);

            const before = game.messages.size;
            const { processWeaponRoll } = await import('/systems/sla-industries/module/sheets/actor/weapon-rolls.mjs');
            await processWeaponRoll(sheet, weapon, form, true);
            const after = game.messages.size;

            await actor.delete();
            return after - before;
        });

        expect(result).toBe(0);
    });
});
