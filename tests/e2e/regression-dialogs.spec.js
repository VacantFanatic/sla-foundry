/**
 * E2E coverage for the sheet-triggered dialog UIs (XPDialog, LuckDialog, and the
 * SlaSimpleContentDialog-hosted Attack/Reload flows) — previously only their
 * underlying roll math was unit/E2E tested, never the dialog UI itself.
 */
const { test, expect } = require('@playwright/test');
const {
    joinGame,
    waitForSLASystem,
    dismissFoundryNotifications,
    createTestActor,
    openActorSheet,
    clickActorSheetTab,
    deleteTestActors,
    closeApplicationWindows
} = require('./fixtures');

test.describe.configure({ timeout: 60_000 });

test.describe('SLA dialogs UI — regression', () => {
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
        await deleteTestActors(page);
        await closeApplicationWindows(page);
    });

    test('XP dialog (GM mode) — opens from the sheet, updates actor XP, and closes on commit', async ({ page }) => {
        const actorId = await createTestActor(page, { xp: { value: 5 } });
        const sheet = await openActorSheet(page, actorId);

        await sheet.locator('.xp-button').click();

        const dialog = page.locator('.xp-dialog-window').last();
        await expect(dialog).toBeVisible();
        await expect(dialog.locator('input[name="xpChange"]')).toBeVisible();
        await expect(dialog.locator('input[name="xpReason"]')).toBeVisible();
        await expect(dialog.locator('.xp-dialog[role="dialog"]')).toHaveAttribute('aria-label', /Experience Points/);

        await dialog.locator('input[name="xpChange"]').fill('10');
        await dialog.locator('input[name="xpReason"]').fill('E2E dialog test');
        await dialog.locator('[data-action="xpCommit"]').click();

        await expect.poll(async () => page.evaluate((id) => game.actors.get(id)?.system.xp.value, actorId)).toBe(15);
        await expect(dialog).toHaveCount(0);
    });

    test('XP dialog — Cancel closes without changing actor XP', async ({ page }) => {
        const actorId = await createTestActor(page, { xp: { value: 5 } });
        const sheet = await openActorSheet(page, actorId);

        await sheet.locator('.xp-button').click();
        const dialog = page.locator('.xp-dialog-window').last();
        await dialog.locator('input[name="xpChange"]').fill('99');
        await dialog.locator('[data-action="xpCancel"]').click();

        await expect(dialog).toHaveCount(0);
        expect(await page.evaluate((id) => game.actors.get(id)?.system.xp.value, actorId)).toBe(5);
    });

    test('Luck dialog — opens from a chat roll, spends Luck, and updates the actor', async ({ page }) => {
        const actorId = await createTestActor(page, { stats: { str: { value: 5 }, luck: { value: 3, max: 5 } } });
        const sheet = await openActorSheet(page, actorId);

        await sheet.locator('.stat-box a.rollable[data-roll-type="stat"][data-key="str"]:has(.fa-dice-d20)').click();
        await expect
            .poll(
                async () =>
                    page.evaluate(() =>
                        globalThis.game?.messages?.contents?.some((m) => /STR\s+CHECK/i.test(String(m.content ?? '')))
                    ),
                { timeout: 15_000 }
            )
            .toBe(true);

        const luckBtn = page.locator('.chat-btn-luck').last();
        await expect(luckBtn).toBeVisible();
        await luckBtn.click();

        const dialog = page.locator('.luck-dialog').last();
        await expect(dialog).toBeVisible();
        await expect(dialog).toHaveAttribute('role', 'dialog');
        await expect(dialog.locator('[data-action="rerollSd"]')).toBeVisible();
        await expect(dialog.locator('input[name="modAmount"]')).toBeVisible();

        await dialog.locator('[data-action="addMod"]').click();

        await expect
            .poll(async () => page.evaluate((id) => game.actors.get(id)?.system.stats.luck.value, actorId))
            .toBe(2);
    });

    test('Attack dialog — opens for a melee weapon, rolls, and closes', async ({ page }) => {
        const originalTargetSetting = await page.evaluate(() =>
            game.settings.get('sla-industries', 'enableTargetRequiredFeatures')
        );
        await page.evaluate(() => game.settings.set('sla-industries', 'enableTargetRequiredFeatures', false));

        try {
            const actorId = await createTestActor(page, { stats: { str: { value: 4 } } });
            await page.evaluate(async (id) => {
                const actor = game.actors.get(id);
                await actor.createEmbeddedDocuments('Item', [
                    { name: 'Combat Knife', type: 'weapon', system: { attackType: 'melee', equipped: true } }
                ]);
            }, actorId);

            const sheet = await openActorSheet(page, actorId);
            await clickActorSheetTab(sheet, 'combat');

            await sheet.locator('.item.sla-combat-row a.rollable.sla-combat-action[data-roll-type="item"]').click();

            const dialog = page.locator('.sla-dialog-window.dialog').last();
            await expect(dialog).toBeVisible();
            await expect(dialog.locator('.sla-simple-dialog-root[role="dialog"]')).toHaveCount(1);
            await expect(dialog.locator('input[name="modifier"]')).toBeVisible();
            await expect(dialog.locator('input[name="charging"]')).toBeVisible();

            await dialog.locator('[data-action="confirmDialog"]').click();
            await expect(dialog).toHaveCount(0);
        } finally {
            await page.evaluate(
                (value) => game.settings.set('sla-industries', 'enableTargetRequiredFeatures', value),
                originalTargetSetting
            );
        }
    });

    test('Reload dialog — appears when 2+ magazines match, and loads the selected one', async ({ page }) => {
        const actorId = await createTestActor(page, {});
        await page.evaluate(async (id) => {
            const actor = game.actors.get(id);
            await actor.createEmbeddedDocuments('Item', [
                {
                    name: 'Assault Rifle',
                    type: 'weapon',
                    system: { attackType: 'ranged', equipped: true, ammo: 0, maxAmmo: 30 }
                }
            ]);
            const [magA] = await actor.createEmbeddedDocuments('Item', [
                { name: 'Standard Mag', type: 'magazine', system: { linkedWeapon: 'Assault Rifle', quantity: 2 } }
            ]);
            await actor.createEmbeddedDocuments('Item', [
                { name: 'AP Mag', type: 'magazine', system: { linkedWeapon: 'Assault Rifle', quantity: 1 } }
            ]);
            return magA.id;
        }, actorId);

        const sheet = await openActorSheet(page, actorId);
        await clickActorSheetTab(sheet, 'combat');

        await sheet.locator('.item.sla-combat-row a.item-reload.sla-combat-action').click();

        const dialog = page.locator('.sla-dialog-window').last();
        await expect(dialog).toBeVisible();
        const select = dialog.locator('select#magazine-select');
        await expect(select).toBeVisible();
        await expect(select.locator('option')).toHaveCount(2);

        await dialog.locator('[data-action="confirmDialog"]').click();
        await expect(dialog).toHaveCount(0);

        await expect
            .poll(async () =>
                page.evaluate(
                    (id) => game.actors.get(id)?.items.find((i) => i.name === 'Assault Rifle')?.system.ammo,
                    actorId
                )
            )
            .toBeGreaterThan(0);
    });

    test('Simple content dialog — Cancel closes without invoking the confirm callback', async ({ page }) => {
        const actorId = await createTestActor(page, {});
        await page.evaluate(async (id) => {
            const actor = game.actors.get(id);
            await actor.createEmbeddedDocuments('Item', [
                {
                    name: 'Pistol',
                    type: 'weapon',
                    system: { attackType: 'ranged', equipped: true, ammo: 0, maxAmmo: 12 }
                }
            ]);
            await actor.createEmbeddedDocuments('Item', [
                { name: 'Mag One', type: 'magazine', system: { linkedWeapon: 'Pistol', quantity: 1 } },
                { name: 'Mag Two', type: 'magazine', system: { linkedWeapon: 'Pistol', quantity: 1 } }
            ]);
        }, actorId);

        const sheet = await openActorSheet(page, actorId);
        await clickActorSheetTab(sheet, 'combat');

        await sheet.locator('.item.sla-combat-row a.item-reload.sla-combat-action').click();
        const dialog = page.locator('.sla-dialog-window').last();
        await expect(dialog).toBeVisible();

        await dialog.locator('[data-action="closeDialog"]').click();
        await expect(dialog).toHaveCount(0);

        expect(
            await page.evaluate(
                (id) => game.actors.get(id)?.items.find((i) => i.name === 'Pistol')?.system.ammo,
                actorId
            )
        ).toBe(0);
    });
});
