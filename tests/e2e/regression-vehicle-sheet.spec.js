const { test, expect } = require('@playwright/test');
const {
    joinGame,
    waitForSLASystem,
    dismissFoundryNotifications,
    createTestActor,
    openActorSheet,
    deleteTestActors,
    closeApplicationWindows
} = require('./fixtures');

test.describe.configure({ timeout: 60_000 });

test.describe('SLA vehicle sheet UI — regression', () => {
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

    test('vehicle sheet — core fields render and are editable', async ({ page }) => {
        const actorId = await createTestActor(
            page,
            {
                hp: { value: 8, max: 12 },
                armor: { pv: 3, resist: { value: 2, max: 4 } },
                move: { value: 6 },
                skill: 'Drive: Wheeled',
                dimensions: { length: '5m', width: '2m', height: '2m' },
                capacity: '1 driver, 3 passengers'
            },
            'vehicle'
        );
        const sheet = await openActorSheet(page, actorId);

        await expect(sheet.locator('input[name="name"]')).toBeVisible();
        await expect(sheet.locator('input[name="system.hp.value"]')).toHaveValue('8');
        await expect(sheet.locator('input[name="system.hp.max"]')).toHaveValue('12');
        await expect(sheet.locator('input[name="system.armor.pv"]')).toHaveValue('3');
        await expect(sheet.locator('input[name="system.armor.resist.value"]')).toHaveValue('2');
        await expect(sheet.locator('input[name="system.armor.resist.max"]')).toHaveValue('4');
        await expect(sheet.locator('input[name="system.move.value"]')).toHaveValue('6');
        await expect(sheet.locator('input[name="system.skill"]')).toHaveValue('Drive: Wheeled');
        await expect(sheet.locator('input[name="system.dimensions.length"]')).toHaveValue('5m');
        await expect(sheet.locator('input[name="system.dimensions.width"]')).toHaveValue('2m');
        await expect(sheet.locator('input[name="system.dimensions.height"]')).toHaveValue('2m');
        await expect(sheet.locator('input[name="system.capacity"]')).toHaveValue('1 driver, 3 passengers');
        await expect(sheet.locator('input[name="system.providesCombatCover"]')).toBeVisible();
        await expect(sheet.locator('input[name="system.mountedWeaponsIgnoreSkillReq"]')).toBeVisible();
    });

    test('vehicle sheet — combat rules checkboxes persist a toggle', async ({ page }) => {
        const actorId = await createTestActor(page, {}, 'vehicle');
        const sheet = await openActorSheet(page, actorId);

        const coverBox = sheet.locator('input[name="system.providesCombatCover"]');
        await expect(coverBox).toBeChecked();
        await coverBox.uncheck();

        await expect
            .poll(async () => page.evaluate((id) => game.actors.get(id)?.system.providesCombatCover, actorId))
            .toBe(false);
    });

    test('vehicle sheet — weapon drop zone shows empty state, then lists an embedded weapon', async ({ page }) => {
        const actorId = await createTestActor(page, {}, 'vehicle');
        const sheet = await openActorSheet(page, actorId);

        await expect(sheet.locator('.vehicle-weapon-drop')).toBeVisible();
        await expect(sheet.locator('.sla-empty-state')).toBeVisible();

        await page.evaluate(async (id) => {
            const actor = game.actors.get(id);
            await actor.createEmbeddedDocuments('Item', [
                { name: 'Mounted Autocannon', type: 'weapon', system: { damage: '4d6' } }
            ]);
        }, actorId);
        await page.evaluate((id) => game.actors.get(id)?.sheet.render(true), actorId);

        const row = sheet.locator('.threat-item[data-item-id]');
        await expect(row).toHaveCount(1);
        await expect(row.locator('.item-name')).toHaveText('Mounted Autocannon');
        await expect(sheet.locator('.sla-empty-state')).toHaveCount(0);
        await expect(row.locator('.item-edit')).toBeVisible();
        await expect(row.locator('.item-delete')).toBeVisible();
    });
});
