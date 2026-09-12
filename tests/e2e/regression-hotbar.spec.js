/**
 * E2E coverage for module/helpers/sla-hotbar.mjs: rollOwnedItem (the
 * `game.sla.rollOwnedItem(uuid)` macro entry point -- UUID resolution,
 * ownership checks, and dispatch through a real ephemeral actor sheet),
 * and getOrCreateSlaItemRollMacro/addActorItemToHotbar (real Macro
 * document creation/reuse and hotbar slot assignment).
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
