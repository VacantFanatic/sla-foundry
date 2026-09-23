const { test, expect } = require('@playwright/test');
const {
    joinGame,
    waitForSLASystem,
    dismissFoundryNotifications,
    createTestActor,
    deleteTestActors,
    closeApplicationWindows
} = require('./fixtures');

test.describe.configure({ timeout: 90_000 });

/** Locator for the rendered Combat HUD window. */
function hud(page) {
    return page.locator('#sla-combat-hud');
}

/** Create an NPC carrying one equipped ranged weapon; returns the actor id. */
async function createArmedNpc(page, name) {
    const actorId = await createTestActor(page, { stats: { str: { value: 5 }, dex: { value: 4 } } }, 'npc');
    await page.evaluate(
        async ({ id, actorName }) => {
            const actor = game.actors.get(id);
            await actor.update({ name: actorName });
            await actor.createEmbeddedDocuments('Item', [
                {
                    name: `${actorName} Pistol`,
                    type: 'weapon',
                    system: {
                        attackType: 'ranged',
                        damage: '2',
                        ammo: 10,
                        maxAmmo: 10,
                        equipped: true
                    }
                }
            ]);
        },
        { id: actorId, actorName: name }
    );
    return actorId;
}

test.describe('GM Combat HUD — regression', () => {
    test.beforeEach(async ({ page }) => {
        test.skip(!process.env.FOUNDRY_USER, 'Set FOUNDRY_USER');
        await joinGame(page);
        await waitForSLASystem(page);
        const gm = await page.evaluate(() => game.user?.isGM === true);
        test.skip(!gm, 'Requires GM — use a Gamemaster account for FOUNDRY_USER');
        await page.evaluate(() => {
            if (globalThis.game?.paused) globalThis.game.togglePause();
        });
        await dismissFoundryNotifications(page);
    });

    test.afterEach(async ({ page }) => {
        await page.evaluate(async () => {
            for (const c of game.combats.contents.filter((c) => c.getFlag('sla-industries', 'e2eHud'))) {
                await c.delete();
            }
            await game.sla.openCombatHud().then((h) => h.focusActor(null));
        });
        await deleteTestActors(page);
        await closeApplicationWindows(page);
    });

    test('shows vitals, weapon controls and quick rolls without opening the sheet', async ({ page }) => {
        const actorId = await createArmedNpc(page, 'E2E HUD Grunt');
        await page.evaluate((id) => game.sla.openCombatHud(game.actors.get(id)), actorId);

        const panel = hud(page);
        await expect(panel.locator('.sla-combat-hud__name')).toHaveText('E2E HUD Grunt');
        await expect(panel.locator('.sla-hp-bar')).toBeVisible();
        await expect(panel.locator('.sla-combat-row', { hasText: 'E2E HUD Grunt Pistol' })).toBeVisible();
        await expect(
            panel
                .locator('.sla-combat-row', { hasText: 'E2E HUD Grunt Pistol' })
                .locator('a.rollable[data-roll-type="item"]')
        ).toBeVisible();
        await expect(panel.locator('a.rollable[data-roll-type="stat"][data-key="str"]')).toBeVisible();
        await expect(panel.locator('.sla-combat-hud__pin')).toHaveClass(/is-active/);

        // The actor's own sheet stays closed — the whole point of the HUD.
        const sheetOpen = await page.evaluate((id) => Boolean(game.actors.get(id)?.sheet?.rendered), actorId);
        expect(sheetOpen).toBe(false);
    });

    test('stat button in the HUD posts a roll to chat', async ({ page }) => {
        const actorId = await createArmedNpc(page, 'E2E HUD Roller');
        await page.evaluate((id) => game.sla.openCombatHud(game.actors.get(id)), actorId);

        const before = await page.evaluate(() => game.messages.size);
        await hud(page).locator('a.rollable[data-roll-type="stat"][data-key="str"]').click();
        await expect
            .poll(async () => page.evaluate(() => game.messages.size), { timeout: 15_000 })
            .toBeGreaterThan(before);
        const last = await page.evaluate(() => String(game.messages.contents.at(-1)?.content ?? ''));
        expect(last).toMatch(/STR\s+CHECK/i);
    });

    test('attack button opens the attack dialog from the HUD', async ({ page }) => {
        const prior = await page.evaluate(() => game.settings.get('sla-industries', 'enableTargetRequiredFeatures'));
        await page.evaluate(() => game.settings.set('sla-industries', 'enableTargetRequiredFeatures', false));
        try {
            const actorId = await createArmedNpc(page, 'E2E HUD Shooter');
            await page.evaluate((id) => game.sla.openCombatHud(game.actors.get(id)), actorId);
            await hud(page)
                .locator('.sla-combat-row', { hasText: 'E2E HUD Shooter Pistol' })
                .locator('a.rollable[data-roll-type="item"]')
                .click();
            await expect(
                page.locator('.sla-dialog-window.dialog').filter({ hasText: 'E2E HUD Shooter Pistol' }).first()
            ).toBeVisible({
                timeout: 15_000
            });
        } finally {
            await page.evaluate(
                (value) => game.settings.set('sla-industries', 'enableTargetRequiredFeatures', value),
                prior
            );
        }
    });

    // Item-edit sits behind `sheet.isEditable` in handleSheetClick, which throws on an unrendered
    // sheet unless createEphemeralSlaSheet supplies it (see LESSONS_LEARNED).
    test('weapon name in the HUD opens the item sheet', async ({ page }) => {
        const actorId = await createArmedNpc(page, 'E2E HUD Editor');
        await page.evaluate((id) => game.sla.openCombatHud(game.actors.get(id)), actorId);
        await hud(page).locator('.sla-combat-row', { hasText: 'E2E HUD Editor Pistol' }).locator('a.item-edit').click();
        await expect(
            page.locator('.application.sheet.item').filter({ hasText: 'E2E HUD Editor Pistol' }).first()
        ).toBeVisible({
            timeout: 15_000
        });
    });

    test('HP edited in the HUD updates the actor', async ({ page }) => {
        const actorId = await createArmedNpc(page, 'E2E HUD Tank');
        await page.evaluate(
            (id) => game.actors.get(id).update({ 'system.hp.max': 20, 'system.hp.value': 20 }),
            actorId
        );
        await page.evaluate((id) => game.sla.openCombatHud(game.actors.get(id)), actorId);

        const hp = hud(page).locator('input[name="system.hp.value"]');
        await hp.fill('12');
        await hp.blur();
        await expect.poll(async () => page.evaluate((id) => game.actors.get(id)?.system.hp.value, actorId)).toBe(12);
    });

    test('follows the active combatant, and the pin holds it in place', async ({ page }) => {
        const a = await createArmedNpc(page, 'E2E HUD Alpha');
        const b = await createArmedNpc(page, 'E2E HUD Bravo');

        await page.evaluate(
            async ({ ids }) => {
                canvas.tokens?.releaseAll();
                const combat = await Combat.create({ flags: { 'sla-industries': { e2eHud: true } } });
                await combat.createEmbeddedDocuments(
                    'Combatant',
                    ids.map((actorId, i) => ({ actorId, initiative: 10 - i }))
                );
                await combat.activate();
                await combat.startCombat();
                const h = await game.sla.openCombatHud();
                h.focusActor(null);
            },
            { ids: [a, b] }
        );

        const name = hud(page).locator('.sla-combat-hud__name');
        await expect(name).toHaveText('E2E HUD Alpha');

        await page.evaluate(() => game.combat.nextTurn());
        await expect(name).toHaveText('E2E HUD Bravo');

        await hud(page).locator('.sla-combat-hud__pin').click();
        await expect(hud(page).locator('.sla-combat-hud__pin')).toHaveClass(/is-active/);
        await page.evaluate(() => game.combat.nextTurn());
        await expect(hud(page).locator('.sla-combat-hud__meta')).not.toContainText(/Acting/i);
        await expect(name).toHaveText('E2E HUD Bravo');

        await hud(page).locator('.sla-combat-hud__pin').click();
        await expect(name).toHaveText('E2E HUD Alpha');
    });
});
