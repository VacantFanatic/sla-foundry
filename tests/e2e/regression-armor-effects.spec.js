/**
 * E2E coverage for module/documents/actor.mjs::_applyArmorModifiers's powersuit-exclusive
 * numbers (STR replace, DEX cap, init bonus). Issue #363's fix let these be authored either as
 * the legacy `system.mods`/`dexCap`/`initBonus` fields or as a real Active Effect on the item
 * (via readItemEffectOverride, module/documents/derived/active-effects.mjs) -- this proves the
 * two authoring paths produce the same result, and that the effect wins when both are present.
 *
 * Assertions compare against a legacy-mods-only "control" actor rather than a hardcoded STR
 * total: a powersuit's STR replace also feeds this system's HP-from-STR formula, which can push
 * a fresh actor into the "critical" condition (HP <= half of its STR-scaled max) and apply an
 * unrelated -2 STR penalty later in the derived-data pipeline. That interaction is real,
 * pre-existing, and identical for both authoring paths -- comparing the two paths directly
 * sidesteps needing to predict it.
 */
const { test, expect } = require('@playwright/test');
const { joinGame, waitForSLASystem } = require('./fixtures');

const needsAuth = () => {
    test.skip(!process.env.FOUNDRY_USER, 'Set FOUNDRY_USER (and FOUNDRY_URL / FOUNDRY_PASSWORD if needed)');
};

test.describe('GM: powersuit stat replace via Active Effect (document API)', () => {
    test.beforeEach(async ({ page }) => {
        needsAuth();
        await joinGame(page);
        await waitForSLASystem(page);
        const gm = await page.evaluate(() => game.user?.isGM === true);
        test.skip(!gm, 'Requires GM — use a Gamemaster account for FOUNDRY_USER');
    });

    test('a powersuit authored with an Active Effect (no mods.str) replaces STR the same way the legacy field does', async ({
        page
    }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();

            const [legacyActor] = await Actor.createDocuments([
                {
                    name: `E2E Powersuit Legacy ${stamp}`,
                    type: 'character',
                    system: { stats: { str: { value: 3, bonus: 0 } } }
                }
            ]);
            await legacyActor.createEmbeddedDocuments('Item', [
                {
                    name: `E2E Powersuit Legacy Armor ${stamp}`,
                    type: 'armor',
                    system: {
                        equipped: true,
                        powered: true,
                        powersuit: true,
                        resistance: { value: 24, max: 24 },
                        mods: { str: 12 }
                    }
                }
            ]);
            const legacyStrTotal = game.actors.get(legacyActor.id).system.stats.str.total;
            await legacyActor.delete();

            const [effectActor] = await Actor.createDocuments([
                {
                    name: `E2E Powersuit Effect ${stamp}`,
                    type: 'character',
                    system: { stats: { str: { value: 3, bonus: 0 } } }
                }
            ]);
            const [powersuit] = await effectActor.createEmbeddedDocuments('Item', [
                {
                    name: `E2E Powersuit Effect Armor ${stamp}`,
                    type: 'armor',
                    system: { equipped: true, powered: true, powersuit: true, resistance: { value: 24, max: 24 } }
                }
            ]);
            await powersuit.createEmbeddedDocuments('ActiveEffect', [
                {
                    name: 'E2E Powersuit STR Replace',
                    disabled: false,
                    changes: [{ key: 'system.stats.str.total', type: 'override', value: 12 }]
                }
            ]);
            const strTotalEquipped = game.actors.get(effectActor.id).system.stats.str.total;

            await powersuit.update({ 'system.equipped': false });
            const strTotalUnequipped = game.actors.get(effectActor.id).system.stats.str.total;

            await effectActor.delete();
            return { legacyStrTotal, strTotalEquipped, strTotalUnequipped };
        });

        expect(result.strTotalEquipped).toBe(result.legacyStrTotal);
        expect(result.strTotalUnequipped).toBe(3);
    });

    test('an Active Effect override wins over a legacy mods.str value on the same item', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();

            const [controlActor] = await Actor.createDocuments([
                {
                    name: `E2E Powersuit Control ${stamp}`,
                    type: 'character',
                    system: { stats: { str: { value: 3, bonus: 0 } } }
                }
            ]);
            await controlActor.createEmbeddedDocuments('Item', [
                {
                    name: `E2E Powersuit Control Armor ${stamp}`,
                    type: 'armor',
                    system: {
                        equipped: true,
                        powered: true,
                        powersuit: true,
                        resistance: { value: 24, max: 24 },
                        mods: { str: 20 }
                    }
                }
            ]);
            const controlStrTotal = game.actors.get(controlActor.id).system.stats.str.total;
            await controlActor.delete();

            const [mixedActor] = await Actor.createDocuments([
                {
                    name: `E2E Powersuit Mixed ${stamp}`,
                    type: 'character',
                    system: { stats: { str: { value: 3, bonus: 0 } } }
                }
            ]);
            const [powersuit] = await mixedActor.createEmbeddedDocuments('Item', [
                {
                    name: `E2E Powersuit Mixed Armor ${stamp}`,
                    type: 'armor',
                    system: {
                        equipped: true,
                        powered: true,
                        powersuit: true,
                        resistance: { value: 24, max: 24 },
                        mods: { str: 5 }
                    }
                }
            ]);
            await powersuit.createEmbeddedDocuments('ActiveEffect', [
                {
                    name: 'E2E Powersuit STR Replace',
                    disabled: false,
                    changes: [{ key: 'system.stats.str.total', type: 'override', value: 20 }]
                }
            ]);
            const mixedStrTotal = game.actors.get(mixedActor.id).system.stats.str.total;

            await mixedActor.delete();
            return { controlStrTotal, mixedStrTotal };
        });

        expect(result.mixedStrTotal).toBe(result.controlStrTotal);
    });
});
