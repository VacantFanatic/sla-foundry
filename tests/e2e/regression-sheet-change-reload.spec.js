/**
 * E2E coverage for module/sheets/actor/sheet-actions.mjs::handleSheetChange
 * (inline numeric field commit + HP-input clamp wiring) and
 * module/sheets/actor/reload.mjs::onReloadWeapon (the magazine-selection
 * branching around the already-tested performReload).
 */
const { test, expect } = require('@playwright/test');
const { joinGame, waitForSLASystem } = require('./fixtures');

const needsAuth = () => {
    test.skip(!process.env.FOUNDRY_USER, 'Set FOUNDRY_USER (and FOUNDRY_URL / FOUNDRY_PASSWORD if needed)');
};

test.describe('GM: handleSheetChange (document API)', () => {
    test.beforeEach(async ({ page }) => {
        needsAuth();
        await joinGame(page);
        await waitForSLASystem(page);
        const gm = await page.evaluate(() => game.user?.isGM === true);
        test.skip(!gm, 'Requires GM — use a Gamemaster account for FOUNDRY_USER');
    });

    test('commits an inline-edit numeric field to the embedded item', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([{ name: `E2E Inline Edit ${stamp}`, type: 'character' }]);
            const [drug] = await actor.createEmbeddedDocuments('Item', [
                { name: `E2E Inline Drug ${stamp}`, type: 'drug', system: { quantity: 1 } }
            ]);

            const row = document.createElement('div');
            row.className = 'item';
            row.dataset.itemId = drug.id;
            const input = document.createElement('input');
            input.className = 'inline-edit';
            input.dataset.itemId = drug.id;
            input.dataset.field = 'system.quantity';
            input.value = '5';
            row.appendChild(input);

            const sheet = { actor, isEditable: true };
            const event = { currentTarget: row, target: input, preventDefault: () => {} };

            const { handleSheetChange } = await import('/systems/sla-industries/module/sheets/actor/sheet-actions.mjs');
            await handleSheetChange(sheet, event);

            const persistedQuantity = game.actors.get(actor.id).items.get(drug.id).system.quantity;
            await actor.delete();
            return persistedQuantity;
        });

        expect(result).toBe(5);
    });

    test('clamps an out-of-range HP input to the actor max', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([
                { name: `E2E HP Clamp ${stamp}`, type: 'character', system: { hp: { value: 5, max: 10 } } }
            ]);

            const input = document.createElement('input');
            input.name = 'system.hp.value';
            input.value = '15';

            const sheet = { actor, isEditable: true };
            const event = { currentTarget: input, target: input, preventDefault: () => {} };

            const { handleSheetChange } = await import('/systems/sla-industries/module/sheets/actor/sheet-actions.mjs');
            await handleSheetChange(sheet, event);

            const clampedInputValue = input.value;
            await actor.delete();
            return clampedInputValue;
        });

        expect(result).toBe('10');
    });
});

test.describe('GM: onReloadWeapon magazine selection (document API)', () => {
    test.beforeEach(async ({ page }) => {
        needsAuth();
        await joinGame(page);
        await waitForSLASystem(page);
        const gm = await page.evaluate(() => game.user?.isGM === true);
        test.skip(!gm, 'Requires GM — use a Gamemaster account for FOUNDRY_USER');
    });

    test('warns and does not reload when no linked magazines have ammo', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([{ name: `E2E Reload NoMag ${stamp}`, type: 'character' }]);
            const weaponName = `E2E Reload NoMag Rifle ${stamp}`;
            const [weapon] = await actor.createEmbeddedDocuments('Item', [
                { name: weaponName, type: 'weapon', system: { ammoType: 'standard' } }
            ]);
            // Linked but depleted (quantity 0) -- should not count as a candidate.
            await actor.createEmbeddedDocuments('Item', [
                {
                    name: `E2E Empty Mag ${stamp}`,
                    type: 'magazine',
                    system: { linkedWeapon: weaponName, quantity: 0, ammoType: 'he' }
                }
            ]);

            const row = document.createElement('div');
            row.className = 'item';
            row.dataset.itemId = weapon.id;
            const btn = document.createElement('button');
            row.appendChild(btn);

            const { onReloadWeapon } = await import('/systems/sla-industries/module/sheets/actor/reload.mjs');
            await onReloadWeapon({ actor }, { preventDefault: () => {}, currentTarget: btn });

            const ammoType = game.actors.get(actor.id).items.get(weapon.id).system.ammoType;
            await actor.delete();
            return ammoType;
        });

        expect(result).toBe('standard');
    });

    test('auto-reloads with the single matching magazine', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([{ name: `E2E Reload Single ${stamp}`, type: 'character' }]);
            const weaponName = `E2E Reload Single Rifle ${stamp}`;
            const [weapon] = await actor.createEmbeddedDocuments('Item', [
                { name: weaponName, type: 'weapon', system: { ammoType: 'standard' } }
            ]);
            await actor.createEmbeddedDocuments('Item', [
                {
                    name: `E2E AP Mag ${stamp}`,
                    type: 'magazine',
                    system: { linkedWeapon: weaponName, quantity: 1, ammoType: 'ap', ammoCapacity: 10 }
                }
            ]);

            const row = document.createElement('div');
            row.className = 'item';
            row.dataset.itemId = weapon.id;
            const btn = document.createElement('button');
            row.appendChild(btn);

            const { onReloadWeapon } = await import('/systems/sla-industries/module/sheets/actor/reload.mjs');
            await onReloadWeapon({ actor }, { preventDefault: () => {}, currentTarget: btn });

            const fresh = game.actors.get(actor.id);
            const ammoType = fresh.items.get(weapon.id).system.ammoType;
            const magazineConsumed = fresh.items.some((i) => i.name === `E2E AP Mag ${stamp}`);
            await actor.delete();
            return { ammoType, magazineConsumed };
        });

        expect(result.ammoType).toBe('ap');
        expect(result.magazineConsumed).toBe(false);
    });
});
