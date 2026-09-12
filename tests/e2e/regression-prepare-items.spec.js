/**
 * E2E coverage for module/helpers/items.mjs::prepareItems -- the actor-sheet
 * item categorization/sorting/damage-resolution pass. It reads game.i18n,
 * CONFIG.SLA, and Roll.replaceFormulaData, so it's Foundry-dependent despite
 * taking a plain items array (no real Documents needed -- it only reads/sets
 * plain properties, never calls .update()/.toObject()).
 */
const { test, expect } = require('@playwright/test');
const { joinGame, waitForSLASystem } = require('./fixtures');

const needsAuth = () => {
    test.skip(!process.env.FOUNDRY_USER, 'Set FOUNDRY_USER (and FOUNDRY_URL / FOUNDRY_PASSWORD if needed)');
};

test.describe('prepareItems (document API)', () => {
    test.beforeEach(async ({ page }) => {
        needsAuth();
        await joinGame(page);
        await waitForSLASystem(page);
    });

    test('categorizes items into inventory/weapon/armor/skill buckets, nests Ebb formulas under their discipline, and resolves flat-formula damage', async ({
        page
    }) => {
        const result = await page.evaluate(async () => {
            const items = [
                {
                    name: 'Pistol',
                    type: 'weapon',
                    system: { skill: 'pistol', damage: '@stats.str.total + 2', minDamage: '0' }
                },
                { name: 'Dice Rifle', type: 'weapon', system: { skill: 'rifle', damage: '2d10', minDamage: '0' } },
                { name: 'Kevlar Vest', type: 'armor', system: { pv: 4 } },
                { name: 'Toughness', type: 'trait', system: {} },
                { name: 'Blast', type: 'discipline', system: {} },
                { name: 'Fireball', type: 'ebbFormula', system: { discipline: 'blast', ebbTarget: 'enemy' } },
                { name: 'Perception', type: 'skill', system: { stat: 'know' } }
            ];
            const rollData = { stats: { str: { total: 5 } } };

            const { prepareItems } = await import('/systems/sla-industries/module/helpers/items.mjs');
            const prepared = prepareItems(items, rollData);

            return {
                weaponCount: prepared.inventory.weapon.items.length,
                armorInventoryCount: prepared.inventory.armor.items.length,
                combatAttackNames: prepared.weapons.map((w) => w.name),
                diceFormulaKept: prepared.weapons.find((w) => w.name === 'Dice Rifle')?.resolvedDamage,
                flatFormulaResolved: prepared.weapons.find((w) => w.name === 'Pistol')?.resolvedDamage,
                traitCount: prepared.traits.length,
                disciplineCount: prepared.disciplines.length,
                nestedFormulaNames: prepared.disciplines[0]?.formulas.map((f) => f.name),
                knowSkillNames: prepared.skillsByStat.know.items.map((s) => s.name)
            };
        });

        expect(result.weaponCount).toBe(2);
        expect(result.armorInventoryCount).toBe(1);
        // combatAttackItems is sorted by name: "Dice Rifle" < "Pistol".
        expect(result.combatAttackNames).toEqual(['Dice Rifle', 'Pistol']);
        expect(result.diceFormulaKept).toBe('2d10');
        expect(result.flatFormulaResolved).toBe(7); // @stats.str.total (5) + 2
        expect(result.traitCount).toBe(1);
        expect(result.disciplineCount).toBe(1);
        expect(result.nestedFormulaNames).toEqual(['Fireball']);
        expect(result.knowSkillNames).toEqual(['Perception']);
    });

    test('enforces minDamage on a resolved flat formula and falls back to the formula string on invalid input', async ({
        page
    }) => {
        const result = await page.evaluate(async () => {
            const items = [
                { name: 'Weak Zapper', type: 'weapon', system: { skill: 'pistol', damage: '1 - 5', minDamage: '3' } },
                {
                    name: 'Broken Gun',
                    type: 'weapon',
                    system: { skill: 'pistol', damage: 'not + a * formula', minDamage: '0' }
                }
            ];

            const { prepareItems } = await import('/systems/sla-industries/module/helpers/items.mjs');
            const prepared = prepareItems(items, {});

            return {
                minDamageEnforced: prepared.weapons.find((w) => w.name === 'Weak Zapper')?.resolvedDamage,
                invalidFallback: prepared.weapons.find((w) => w.name === 'Broken Gun')?.resolvedDamage
            };
        });

        expect(result.minDamageEnforced).toBe(3);
        expect(result.invalidFallback).toBe('not + a * formula');
    });
});
