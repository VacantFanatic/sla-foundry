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
const {
    joinGame,
    waitForSLASystem,
    dismissFoundryNotifications,
    createTestActor,
    openActorSheet,
    clickActorSheetTab,
    closeApplicationWindows
} = require('./fixtures');

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

    test('issue #363: equipping gear via item-toggle applies its Active Effect stat bonus, unequipping removes it', async ({
        page
    }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([
                {
                    name: `E2E Gear Effect ${stamp}`,
                    type: 'character',
                    system: { stats: { str: { value: 3, bonus: 0 } } }
                }
            ]);
            const [gear] = await actor.createEmbeddedDocuments('Item', [
                { name: `E2E Effect Gear ${stamp}`, type: 'item', system: { equipped: false } }
            ]);
            await gear.createEmbeddedDocuments('ActiveEffect', [
                {
                    name: 'E2E Gear Str Boost',
                    disabled: false,
                    changes: [{ key: 'system.stats.str.bonus', type: 'add', value: 3 }]
                }
            ]);

            const row = document.createElement('div');
            row.className = 'item';
            row.dataset.itemId = gear.id;
            const toggle = document.createElement('button');
            toggle.className = 'item-toggle';
            row.appendChild(toggle);
            const event = { target: toggle, preventDefault: () => {} };

            const { handleSheetClick } = await import('/systems/sla-industries/module/sheets/actor/sheet-actions.mjs');
            const sheet = { actor, isEditable: true, render: () => {} };

            // Equip: the Active Effect should be copied onto the actor and the stat total bumped.
            await handleSheetClick(sheet, event);
            const equippedActor = game.actors.get(actor.id);
            const strTotalEquipped = equippedActor.system.stats.str.total;
            const equippedEffectCount = equippedActor.effects.filter((e) => e.origin === gear.uuid).length;

            // Unequip: the copied effect should be removed and the bonus should revert.
            await handleSheetClick(sheet, event);
            const unequippedActor = game.actors.get(actor.id);
            const strTotalUnequipped = unequippedActor.system.stats.str.total;
            const unequippedEffectCount = unequippedActor.effects.filter((e) => e.origin === gear.uuid).length;

            await actor.delete();
            return { strTotalEquipped, equippedEffectCount, strTotalUnequipped, unequippedEffectCount };
        });

        expect(result.equippedEffectCount).toBe(1);
        expect(result.strTotalEquipped).toBe(6);
        expect(result.unequippedEffectCount).toBe(0);
        expect(result.strTotalUnequipped).toBe(3);
    });

    test('issue #369: the real Inventory tab renders an equip toggle for Item/Gear rows, and clicking it applies the effect', async ({
        page
    }) => {
        const actorId = await createTestActor(page, { stats: { str: { value: 3, bonus: 0 } } }, 'character');
        const gearId = await page.evaluate(async (id) => {
            const actor = game.actors.get(id);
            const [gear] = await actor.createEmbeddedDocuments('Item', [
                { name: `E2E Gear Toggle ${Date.now()}`, type: 'item', system: { equipped: false } }
            ]);
            await gear.createEmbeddedDocuments('ActiveEffect', [
                {
                    name: 'E2E Gear Str Boost',
                    disabled: false,
                    changes: [{ key: 'system.stats.str.bonus', type: 'add', value: 3 }]
                }
            ]);
            return gear.id;
        }, actorId);

        const sheet = await openActorSheet(page, actorId);
        await dismissFoundryNotifications(page);
        await clickActorSheetTab(sheet, 'inventory');

        const row = sheet.locator(`tr.item[data-item-id="${gearId}"]`);
        const toggle = row.locator('.item-toggle');
        // The bug: this template gate previously excluded type "item" (Gear) entirely, so the
        // equip control never rendered and setEquipped()/applyItemEffectsToActor() was
        // unreachable from the real UI, even though the click handler itself worked.
        await expect(toggle).toBeVisible();

        await toggle.evaluate((el) => el.click());
        await page.waitForFunction(
            ({ id, uuid }) => game.actors.get(id).effects.some((e) => e.origin === uuid),
            { id: actorId, uuid: `Actor.${actorId}.Item.${gearId}` },
            { timeout: 10_000 }
        );
        const strTotalEquipped = await page.evaluate((id) => game.actors.get(id).system.stats.str.total, actorId);
        expect(strTotalEquipped).toBe(6);

        await toggle.evaluate((el) => el.click());
        await page.waitForFunction(
            ({ id, uuid }) => !game.actors.get(id).effects.some((e) => e.origin === uuid),
            { id: actorId, uuid: `Actor.${actorId}.Item.${gearId}` },
            { timeout: 10_000 }
        );
        const strTotalUnequipped = await page.evaluate((id) => game.actors.get(id).system.stats.str.total, actorId);
        expect(strTotalUnequipped).toBe(3);

        await closeApplicationWindows(page);
        await page.evaluate(async (id) => {
            await game.actors.get(id)?.delete();
        }, actorId);
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
