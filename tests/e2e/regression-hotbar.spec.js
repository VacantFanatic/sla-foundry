/**
 * E2E coverage for module/helpers/sla-hotbar.mjs: rollOwnedItem (the
 * `game.sla.rollOwnedItem(uuid)` macro entry point -- UUID resolution,
 * ownership checks, and dispatch through a real ephemeral actor sheet),
 * getOrCreateSlaItemRollMacro/addActorItemToHotbar (real Macro
 * document creation/reuse and hotbar slot assignment), reloadWeapon (the
 * `game.sla.reloadWeapon(uuid)` headless reload entry point), and
 * toggleItemEquipped (the `game.sla.toggleItemEquipped(uuid)` headless
 * equip-toggle entry point).
 */
const { test, expect } = require('@playwright/test');
const { joinGame, waitForSLASystem } = require('./fixtures');

const needsAuth = () => {
    test.skip(!process.env.FOUNDRY_USER, 'Set FOUNDRY_USER (and FOUNDRY_URL / FOUNDRY_PASSWORD if needed)');
};

test.describe('GM: rollOwnedItem (document API)', () => {
    test.beforeEach(async ({ page }) => {
        needsAuth();
        await joinGame(page);
        await waitForSLASystem(page);
        const gm = await page.evaluate(() => game.user?.isGM === true);
        test.skip(!gm, 'Requires GM — use a Gamemaster account for FOUNDRY_USER');
    });

    test('warns and does nothing for an invalid uuid', async ({ page }) => {
        const threw = await page.evaluate(async () => {
            const { rollOwnedItem } = await import('/systems/sla-industries/module/helpers/sla-hotbar.mjs');
            try {
                await rollOwnedItem('');
                await rollOwnedItem('Item.does-not-exist');
                return false;
            } catch {
                return true;
            }
        });

        expect(threw).toBe(false);
    });

    test('resolves a real embedded skill item through a real ephemeral sheet and posts a roll', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([{ name: `E2E Hotbar Roll ${stamp}`, type: 'character' }]);
            const [skill] = await actor.createEmbeddedDocuments('Item', [
                { name: `E2E Hotbar Skill ${stamp}`, type: 'skill', system: { rank: '1', stat: 'dex' } }
            ]);

            const before = game.messages.size;
            const { rollOwnedItem } = await import('/systems/sla-industries/module/helpers/sla-hotbar.mjs');
            await rollOwnedItem(skill.uuid);
            const after = game.messages.size;

            await actor.delete();
            return after > before;
        });

        expect(result).toBe(true);
    });
});

test.describe('GM: getOrCreateSlaItemRollMacro / addActorItemToHotbar (document API)', () => {
    test.beforeEach(async ({ page }) => {
        needsAuth();
        await joinGame(page);
        await waitForSLASystem(page);
        const gm = await page.evaluate(() => game.user?.isGM === true);
        test.skip(!gm, 'Requires GM — use a Gamemaster account for FOUNDRY_USER');
    });

    test('creates a macro once and reuses it on a second call for the same item', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([{ name: `E2E Hotbar Macro ${stamp}`, type: 'character' }]);
            const [skill] = await actor.createEmbeddedDocuments('Item', [
                { name: `E2E Macro Skill ${stamp}`, type: 'skill' }
            ]);

            const { getOrCreateSlaItemRollMacro } =
                await import('/systems/sla-industries/module/helpers/sla-hotbar.mjs');
            const item = actor.items.get(skill.id);
            const first = await getOrCreateSlaItemRollMacro(item);
            const second = await getOrCreateSlaItemRollMacro(item);

            const outcome = {
                sameId: first?.id === second?.id,
                label: first?.name,
                flaggedUuid: first?.getFlag('sla-industries', 'itemMacroUuid')
            };

            await first?.delete();
            await actor.delete();
            return outcome;
        });

        expect(result.sameId).toBe(true);
        expect(result.label).toMatch(/^Operative: E2E Macro Skill /);
        expect(result.flaggedUuid).toBeTruthy();
    });

    test('addActorItemToHotbar assigns the macro to the first empty slot', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([{ name: `E2E Hotbar Slot ${stamp}`, type: 'character' }]);
            const [skill] = await actor.createEmbeddedDocuments('Item', [
                { name: `E2E Slot Skill ${stamp}`, type: 'skill' }
            ]);
            const item = actor.items.get(skill.id);

            const { addActorItemToHotbar, getOrCreateSlaItemRollMacro } =
                await import('/systems/sla-industries/module/helpers/sla-hotbar.mjs');
            await addActorItemToHotbar(item);

            const macro = await getOrCreateSlaItemRollMacro(item);
            const assignedSlot = Object.entries(game.user.hotbar ?? {}).find(([, id]) => id === macro?.id)?.[0];

            if (assignedSlot) await game.user.assignHotbarMacro(null, Number(assignedSlot));
            await macro?.delete();
            await actor.delete();
            return Boolean(assignedSlot);
        });

        expect(result).toBe(true);
    });
});

test.describe('GM: reloadWeapon (document API)', () => {
    test.beforeEach(async ({ page }) => {
        needsAuth();
        await joinGame(page);
        await waitForSLASystem(page);
        const gm = await page.evaluate(() => game.user?.isGM === true);
        test.skip(!gm, 'Requires GM — use a Gamemaster account for FOUNDRY_USER');
    });

    test('warns and returns false for an invalid uuid without throwing', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const { reloadWeapon } = await import('/systems/sla-industries/module/helpers/sla-hotbar.mjs');
            try {
                const empty = await reloadWeapon('');
                const missing = await reloadWeapon('Item.does-not-exist');
                return { threw: false, empty, missing };
            } catch {
                return { threw: true };
            }
        });

        expect(result.threw).toBe(false);
        expect(result.empty).toBe(false);
        expect(result.missing).toBe(false);
    });

    test('reloads automatically with a single matching magazine', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([
                { name: `E2E API Reload Single ${stamp}`, type: 'character' }
            ]);
            const weaponName = `E2E API Reload Rifle ${stamp}`;
            const [weapon] = await actor.createEmbeddedDocuments('Item', [
                { name: weaponName, type: 'weapon', system: { ammoType: 'standard' } }
            ]);
            const [magazine] = await actor.createEmbeddedDocuments('Item', [
                {
                    name: `E2E API Reload Mag ${stamp}`,
                    type: 'magazine',
                    system: { linkedWeapon: weaponName, quantity: 1, ammoType: 'ap', ammoCapacity: 12 }
                }
            ]);

            const { reloadWeapon } = await import('/systems/sla-industries/module/helpers/sla-hotbar.mjs');
            const reloaded = await reloadWeapon(weapon.uuid);

            const fresh = game.actors.get(actor.id);
            const ammoType = fresh.items.get(weapon.id).system.ammoType;
            const magazineConsumed = !fresh.items.has(magazine.id);
            await actor.delete();
            return { reloaded, ammoType, magazineConsumed };
        });

        expect(result.reloaded).toBe(true);
        expect(result.ammoType).toBe('ap');
        expect(result.magazineConsumed).toBe(true);
    });

    test('warns and returns false when no linked magazine has ammo', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([{ name: `E2E API Reload NoMag ${stamp}`, type: 'character' }]);
            const weaponName = `E2E API NoMag Rifle ${stamp}`;
            const [weapon] = await actor.createEmbeddedDocuments('Item', [
                { name: weaponName, type: 'weapon', system: { ammoType: 'standard' } }
            ]);
            await actor.createEmbeddedDocuments('Item', [
                {
                    name: `E2E API Empty Mag ${stamp}`,
                    type: 'magazine',
                    system: { linkedWeapon: weaponName, quantity: 0, ammoType: 'he' }
                }
            ]);

            const { reloadWeapon } = await import('/systems/sla-industries/module/helpers/sla-hotbar.mjs');
            const reloaded = await reloadWeapon(weapon.uuid);

            const ammoType = game.actors.get(actor.id).items.get(weapon.id).system.ammoType;
            await actor.delete();
            return { reloaded, ammoType };
        });

        expect(result.reloaded).toBe(false);
        expect(result.ammoType).toBe('standard');
    });

    test('warns and returns false without picking a magazine when more than one matches', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([{ name: `E2E API Reload Multi ${stamp}`, type: 'character' }]);
            const weaponName = `E2E API Multi Rifle ${stamp}`;
            const [weapon] = await actor.createEmbeddedDocuments('Item', [
                { name: weaponName, type: 'weapon', system: { ammoType: 'standard' } }
            ]);
            const [magA, magB] = await actor.createEmbeddedDocuments('Item', [
                {
                    name: `E2E API Multi Mag AP ${stamp}`,
                    type: 'magazine',
                    system: { linkedWeapon: weaponName, quantity: 1, ammoType: 'ap', ammoCapacity: 10 }
                },
                {
                    name: `E2E API Multi Mag HE ${stamp}`,
                    type: 'magazine',
                    system: { linkedWeapon: weaponName, quantity: 1, ammoType: 'he', ammoCapacity: 10 }
                }
            ]);

            const { reloadWeapon } = await import('/systems/sla-industries/module/helpers/sla-hotbar.mjs');
            const reloaded = await reloadWeapon(weapon.uuid);

            const fresh = game.actors.get(actor.id);
            const outcome = {
                reloaded,
                ammoType: fresh.items.get(weapon.id).system.ammoType,
                magAQuantity: fresh.items.get(magA.id)?.system.quantity,
                magBQuantity: fresh.items.get(magB.id)?.system.quantity
            };
            await actor.delete();
            return outcome;
        });

        expect(result.reloaded).toBe(false);
        expect(result.ammoType).toBe('standard');
        expect(result.magAQuantity).toBe(1);
        expect(result.magBQuantity).toBe(1);
    });
});

test.describe('GM: toggleItemEquipped (document API)', () => {
    test.beforeEach(async ({ page }) => {
        needsAuth();
        await joinGame(page);
        await waitForSLASystem(page);
        const gm = await page.evaluate(() => game.user?.isGM === true);
        test.skip(!gm, 'Requires GM — use a Gamemaster account for FOUNDRY_USER');
    });

    test('warns and returns undefined for an invalid uuid without throwing', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const { toggleItemEquipped } = await import('/systems/sla-industries/module/helpers/sla-hotbar.mjs');
            try {
                const empty = await toggleItemEquipped('');
                const missing = await toggleItemEquipped('Item.does-not-exist');
                return { threw: false, empty, missing };
            } catch {
                return { threw: true };
            }
        });

        expect(result.threw).toBe(false);
        expect(result.empty).toBeUndefined();
        expect(result.missing).toBeUndefined();
    });

    test('toggles a weapon item equipped state true to false', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([{ name: `E2E API Toggle ${stamp}`, type: 'character' }]);
            const [weapon] = await actor.createEmbeddedDocuments('Item', [
                { name: `E2E API Toggle Weapon ${stamp}`, type: 'weapon', system: { equipped: true } }
            ]);

            const { toggleItemEquipped } = await import('/systems/sla-industries/module/helpers/sla-hotbar.mjs');
            const returned = await toggleItemEquipped(weapon.uuid);

            const persisted = game.actors.get(actor.id).items.get(weapon.id).system.equipped;
            await actor.delete();
            return { returned, persisted };
        });

        expect(result.returned).toBe(false);
        expect(result.persisted).toBe(false);
    });

    test('toggling a gear item false to true applies its Active Effect, back to false removes it', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([
                { name: `E2E API Toggle Effect ${stamp}`, type: 'character' }
            ]);
            const [gear] = await actor.createEmbeddedDocuments('Item', [
                { name: `E2E API Toggle Gear ${stamp}`, type: 'item', system: { equipped: false } }
            ]);
            await gear.createEmbeddedDocuments('ActiveEffect', [
                { name: 'E2E API Toggle Bonus', changes: [], transfer: false }
            ]);

            const { toggleItemEquipped } = await import('/systems/sla-industries/module/helpers/sla-hotbar.mjs');

            const equippedState = await toggleItemEquipped(gear.uuid);
            const equippedCount = game.actors.get(actor.id).effects.filter((e) => e.origin === gear.uuid).length;

            const unequippedState = await toggleItemEquipped(gear.uuid);
            const unequippedCount = game.actors.get(actor.id).effects.filter((e) => e.origin === gear.uuid).length;

            await actor.delete();
            return { equippedState, equippedCount, unequippedState, unequippedCount };
        });

        expect(result.equippedState).toBe(true);
        expect(result.equippedCount).toBe(1);
        expect(result.unequippedState).toBe(false);
        expect(result.unequippedCount).toBe(0);
    });

    test('warns and returns undefined for an item type with no equip toggle', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([
                { name: `E2E API Toggle Unsupported ${stamp}`, type: 'character' }
            ]);
            const [skill] = await actor.createEmbeddedDocuments('Item', [
                { name: `E2E API Toggle Skill ${stamp}`, type: 'skill' }
            ]);

            const { toggleItemEquipped } = await import('/systems/sla-industries/module/helpers/sla-hotbar.mjs');
            const returned = await toggleItemEquipped(skill.uuid);

            const effectCount = game.actors.get(actor.id).effects.size;
            await actor.delete();
            return { returned, effectCount };
        });

        expect(result.returned).toBeUndefined();
        expect(result.effectCount).toBe(0);
    });
});
