/**
 * E2E coverage for module/sheets/actor/sheet-actions.mjs::handleSheetClick --
 * the ~20-branch DOM click dispatcher for the actor sheet. Every branch
 * either delegates to an already-tested function (executeCombatLoadoutDamageRoll,
 * handleSheetRoll, useDrugItem, onReloadWeapon, onItemCreate -- each covered
 * in its own spec) or performs a trivial one-line document write itself; there
 * is no hidden calculation here worth extracting into sheet-actions-pure.mjs
 * beyond what's already there (buildSpeciesRemovalUpdates). These tests cover
 * a representative subset of the dispatcher's own direct-write branches,
 * calling it with a constructed event rather than rendering a full sheet.
 * The dialog-gated branches (species/package/item delete) are skipped --
 * they only mutate state inside a confirm-dialog callback that a real user
 * click would trigger, not on dispatch alone.
 */
const { test, expect } = require('@playwright/test');
const { joinGame, waitForSLASystem } = require('./fixtures');

const needsAuth = () => {
    test.skip(!process.env.FOUNDRY_USER, 'Set FOUNDRY_USER (and FOUNDRY_URL / FOUNDRY_PASSWORD if needed)');
};

test.describe('GM: handleSheetClick dispatch (document API)', () => {
    test.beforeEach(async ({ page }) => {
        needsAuth();
        await joinGame(page);
        await waitForSLASystem(page);
        const gm = await page.evaluate(() => game.user?.isGM === true);
        test.skip(!gm, 'Requires GM — use a Gamemaster account for FOUNDRY_USER');
    });

    test('toggles a wound diagram slot', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([
                { name: `E2E Click Wound ${stamp}`, type: 'character', system: { wounds: { head: false } } }
            ]);

            const slot = document.createElement('div');
            slot.className = 'sla-wound-diagram__slot';
            slot.dataset.wound = 'head';
            const event = { target: slot, preventDefault: () => {} };

            const { handleSheetClick } = await import('/systems/sla-industries/module/sheets/actor/sheet-actions.mjs');
            await handleSheetClick({ actor, isEditable: true, render: () => {} }, event);

            const persisted = game.actors.get(actor.id).system.wounds.head;
            await actor.delete();
            return persisted;
        });

        expect(result).toBe(true);
    });

    test('toggles item equipped state via item-toggle', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([{ name: `E2E Click Toggle ${stamp}`, type: 'character' }]);
            const [weapon] = await actor.createEmbeddedDocuments('Item', [
                { name: `E2E Toggle Weapon ${stamp}`, type: 'weapon', system: { equipped: false } }
            ]);

            const row = document.createElement('div');
            row.className = 'item';
            row.dataset.itemId = weapon.id;
            const toggle = document.createElement('button');
            toggle.className = 'item-toggle';
            row.appendChild(toggle);
            const event = { target: toggle, preventDefault: () => {} };

            const { handleSheetClick } = await import('/systems/sla-industries/module/sheets/actor/sheet-actions.mjs');
            await handleSheetClick({ actor, isEditable: true, render: () => {} }, event);

            const persisted = game.actors.get(actor.id).items.get(weapon.id).system.equipped;
            await actor.delete();
            return persisted;
        });

        expect(result).toBe(true);
    });

    test('creates, toggles-disabled, and deletes an Active Effect', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([{ name: `E2E Click Effects ${stamp}`, type: 'character' }]);
            const sheet = { actor, isEditable: true, render: () => {} };

            const { handleSheetClick } = await import('/systems/sla-industries/module/sheets/actor/sheet-actions.mjs');

            const createBtn = document.createElement('button');
            createBtn.className = 'sla-effect-create';
            await handleSheetClick(sheet, { target: createBtn, preventDefault: () => {} });

            const created = game.actors.get(actor.id).effects.contents[0];
            const createdId = created?.id;
            const disabledAfterCreate = created?.disabled;

            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'sla-effect-toggle';
            toggleBtn.dataset.effectId = createdId;
            await handleSheetClick(sheet, { target: toggleBtn, preventDefault: () => {} });
            const disabledAfterToggle = game.actors.get(actor.id).effects.get(createdId)?.disabled;

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'sla-effect-delete';
            deleteBtn.dataset.effectId = createdId;
            await handleSheetClick(sheet, { target: deleteBtn, preventDefault: () => {} });
            const existsAfterDelete = Boolean(game.actors.get(actor.id).effects.get(createdId));

            await actor.delete();
            return { createdId: Boolean(createdId), disabledAfterCreate, disabledAfterToggle, existsAfterDelete };
        });

        expect(result.createdId).toBe(true);
        expect(result.disabledAfterCreate).toBe(false);
        expect(result.disabledAfterToggle).toBe(true);
        expect(result.existsAfterDelete).toBe(false);
    });

    test('dispatches drug use through item-use-drug', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([{ name: `E2E Click Drug ${stamp}`, type: 'character' }]);
            const [drug] = await actor.createEmbeddedDocuments('Item', [
                { name: `E2E Click Stim ${stamp}`, type: 'drug', system: { quantity: 2 } }
            ]);

            const row = document.createElement('div');
            row.className = 'item';
            row.dataset.itemId = drug.id;
            const useBtn = document.createElement('button');
            useBtn.className = 'item-use-drug';
            row.appendChild(useBtn);

            const { handleSheetClick } = await import('/systems/sla-industries/module/sheets/actor/sheet-actions.mjs');
            await handleSheetClick(
                { actor, isEditable: true, render: () => {} },
                {
                    target: useBtn,
                    preventDefault: () => {}
                }
            );

            const persistedQuantity = game.actors.get(actor.id).items.get(drug.id).system.quantity;
            await actor.delete();
            return persistedQuantity;
        });

        expect(result).toBe(1);
    });
});
