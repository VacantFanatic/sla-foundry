/**
 * E2E coverage for module/sheets/actor/item-actions.mjs::useDrugItem and
 * module/migration/natural-weapons.mjs::migrateNaturalWeapons -- both write
 * directly to real actor/item documents and were previously untested.
 */
const { test, expect } = require('@playwright/test');
const { joinGame, waitForSLASystem } = require('./fixtures');

const needsAuth = () => {
    test.skip(!process.env.FOUNDRY_USER, 'Set FOUNDRY_USER (and FOUNDRY_URL / FOUNDRY_PASSWORD if needed)');
};

test.describe('GM: useDrugItem (document API)', () => {
    test.beforeEach(async ({ page }) => {
        needsAuth();
        await joinGame(page);
        await waitForSLASystem(page);
        const gm = await page.evaluate(() => game.user?.isGM === true);
        test.skip(!gm, 'Requires GM — use a Gamemaster account for FOUNDRY_USER');
    });

    test('decrements quantity and keeps the item when more doses remain', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([{ name: `E2E Drug User ${stamp}`, type: 'character' }]);
            const [drug] = await actor.createEmbeddedDocuments('Item', [
                { name: `E2E Stim ${stamp}`, type: 'drug', system: { quantity: 3 } }
            ]);

            const { useDrugItem } = await import('/systems/sla-industries/module/sheets/actor/item-actions.mjs');
            await useDrugItem({ actor }, drug);

            const survivor = actor.items.get(drug.id);
            const persisted = { exists: Boolean(survivor), quantity: survivor?.system.quantity };
            await actor.delete();
            return persisted;
        });

        expect(result.exists).toBe(true);
        expect(result.quantity).toBe(2);
    });

    test('deletes the item on the last dose', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([{ name: `E2E Drug Last Dose ${stamp}`, type: 'character' }]);
            const [drug] = await actor.createEmbeddedDocuments('Item', [
                { name: `E2E Last Stim ${stamp}`, type: 'drug', system: { quantity: 1 } }
            ]);

            const { useDrugItem } = await import('/systems/sla-industries/module/sheets/actor/item-actions.mjs');
            await useDrugItem({ actor }, drug);

            const stillExists = Boolean(actor.items.get(drug.id));
            await actor.delete();
            return stillExists;
        });

        expect(result).toBe(false);
    });

    test("applies the drug's embedded Active Effects to the actor", async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([
                {
                    name: `E2E Drug Effects ${stamp}`,
                    type: 'character',
                    system: { stats: { str: { value: 3, bonus: 0 } } }
                }
            ]);
            const [drug] = await actor.createEmbeddedDocuments('Item', [
                { name: `E2E Combat Drug ${stamp}`, type: 'drug', system: { quantity: 2 } }
            ]);
            await drug.createEmbeddedDocuments('ActiveEffect', [
                {
                    name: 'E2E Drug Str Boost',
                    disabled: false,
                    changes: [{ key: 'system.stats.str.bonus', type: CONST.ACTIVE_EFFECT_CHANGE_TYPES.ADD, value: 3 }]
                }
            ]);

            const { useDrugItem } = await import('/systems/sla-industries/module/sheets/actor/item-actions.mjs');
            await useDrugItem({ actor }, drug);

            const persistedStrTotal = game.actors.get(actor.id).system.stats.str.total;
            await actor.delete();
            return persistedStrTotal;
        });

        expect(result).toBe(6);
    });
});

test.describe('GM: migrateNaturalWeapons (document API)', () => {
    test.beforeEach(async ({ page }) => {
        needsAuth();
        await joinGame(page);
        await waitForSLASystem(page);
        const gm = await page.evaluate(() => game.user?.isGM === true);
        test.skip(!gm, 'Requires GM — use a Gamemaster account for FOUNDRY_USER');
    });

    test('replaces a legacy Teeth/Claws (Stormer) item with the current natural-weapon data', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([{ name: `E2E NatWeapon Stormer ${stamp}`, type: 'npc' }]);
            await actor.createEmbeddedDocuments('Item', [
                { name: 'Teeth/Claws (Stormer)', type: 'weapon', system: { damage: '1d10' } }
            ]);

            const { migrateNaturalWeapons } =
                await import('/systems/sla-industries/module/migration/natural-weapons.mjs');
            await migrateNaturalWeapons(true);

            // The replacement item shares the legacy name ("Teeth/Claws (Stormer)") but carries the
            // current damage formula, not the legacy "1d10" stub -- so identity is by damage, not name.
            const fresh = game.actors.get(actor.id);
            const teethClaws = fresh.items.filter((i) => i.name === 'Teeth/Claws (Stormer)');
            const legacyStubRemains = teethClaws.some((i) => i.system.damage === '1d10');
            const replacementPresent = teethClaws.some((i) => i.system.damage === '@stats.str.total - 1');

            await actor.delete();
            return { itemCount: teethClaws.length, legacyStubRemains, replacementPresent };
        });

        expect(result.itemCount).toBe(1);
        expect(result.legacyStubRemains).toBe(false);
        expect(result.replacementPresent).toBe(true);
    });

    test('adds a missing Punch/Kick to character and npc actors, and dedupes extras', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [noPunch] = await Actor.createDocuments([
                { name: `E2E NatWeapon NoPunch ${stamp}`, type: 'character' }
            ]);
            const [dupePunch] = await Actor.createDocuments([
                { name: `E2E NatWeapon Dupe ${stamp}`, type: 'character' }
            ]);
            await dupePunch.createEmbeddedDocuments('Item', [
                { name: 'Punch/Kick', type: 'weapon' },
                { name: 'Punch/Kick', type: 'weapon' }
            ]);

            const { migrateNaturalWeapons } =
                await import('/systems/sla-industries/module/migration/natural-weapons.mjs');
            await migrateNaturalWeapons(true);

            const noPunchCount = game.actors.get(noPunch.id).items.filter((i) => i.name === 'Punch/Kick').length;
            const dupePunchCount = game.actors.get(dupePunch.id).items.filter((i) => i.name === 'Punch/Kick').length;

            await noPunch.delete();
            await dupePunch.delete();
            return { noPunchCount, dupePunchCount };
        });

        expect(result.noPunchCount).toBe(1);
        expect(result.dupePunchCount).toBe(1);
    });
});
