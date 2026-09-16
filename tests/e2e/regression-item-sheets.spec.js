const { test, expect } = require('@playwright/test');
const {
    joinGame,
    waitForSLASystem,
    dismissFoundryNotifications,
    createWorldItem,
    openItemSheet,
    clickItemSheetTab,
    closeApplicationWindows
} = require('./fixtures');

test.describe.configure({ timeout: 60_000 });

test.describe('SLA item sheet UI — regression', () => {
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
        await page
            .evaluate(async () => {
                for (const item of game.items.filter((i) => i.name?.startsWith('E2E Item '))) {
                    await item.delete();
                }
            })
            .catch(() => {});
        await closeApplicationWindows(page);
    });

    test('discipline sheet — two tabs, spectral stamp, rank field', async ({ page }) => {
        const itemId = await createWorldItem(page, 'discipline', { rank: 2 });
        const sheet = await openItemSheet(page, itemId);

        await expect(sheet.locator('.spectral-stamp')).toHaveText('Ebb Discipline');
        await expect(sheet.locator('.spectral-container--discipline')).toBeVisible();
        await expect(sheet.locator('input[name="system.rank"]')).toHaveValue('2');
        await expect(sheet.locator('nav.sheet-tabs a[data-tab="attributes"]')).toBeVisible();
        await expect(sheet.locator('nav.sheet-tabs a[data-tab="description"]')).toBeVisible();
        await expect(sheet.locator('nav.sheet-tabs a[data-tab="effects"]')).toHaveCount(0);
    });

    test('ebb formula sheet — spectral layout, discipline drop zone, effects tab', async ({ page }) => {
        const itemId = await createWorldItem(page, 'ebbFormula', {
            formulaRating: 3,
            cost: 2,
            ebbEffect: 'damage',
            discipline: '',
            ad: 4,
            rof: '3',
            recoil: '2'
        });
        const sheet = await openItemSheet(page, itemId);

        await expect(sheet.locator('.spectral-stamp')).toHaveText('Ebb Formula');
        await expect(sheet.getByText('Formula Data')).toBeVisible();
        await expect(sheet.locator('.spectral-container--formula')).toBeVisible();
        await expect(sheet.locator('.sla-drop.discipline-drop-zone')).toBeVisible();
        await expect(sheet.locator('.sla-drop__hint')).toHaveText('Drop Discipline Item Here');
        await expect(sheet.locator('input[name="system.formulaRating"]')).toHaveValue('3');

        // Issue #349: AD/ROF/Recoil/Range are rendered for the default 'ranged' attack shape.
        await expect(sheet.locator('input[name="system.ad"]')).toHaveValue('4');
        await expect(sheet.locator('input[name="system.rof"]')).toHaveValue('3');
        await expect(sheet.locator('input[name="system.recoil"]')).toHaveValue('2');
        await expect(sheet.locator('input[name="system.range"]')).toBeVisible();

        await clickItemSheetTab(sheet, 'effects');
        await expect(sheet.locator('.sla-item-effects .sla-section__title')).toHaveText('Active Effects');
        await expect(sheet.locator('.sla-effects-empty')).toHaveText('No active effects.');
        await expect(sheet.locator('.sla-item-effect-create')).toBeVisible();
    });

    test('ebb formula sheet — blast attack shape swaps in blast radius fields', async ({ page }) => {
        const itemId = await createWorldItem(page, 'ebbFormula', {
            formulaShape: 'blast',
            ad: 2,
            blastRadiusInner: 2,
            blastRadiusOuter: 5
        });
        const sheet = await openItemSheet(page, itemId);

        await expect(sheet.locator('input[name="system.blastRadiusInner"]')).toHaveValue('2');
        await expect(sheet.locator('input[name="system.blastRadiusOuter"]')).toHaveValue('5');
        await expect(sheet.locator('input[name="system.range"]')).toHaveCount(0);
        await expect(sheet.locator('input[name="system.rof"]')).toHaveCount(0);
        await expect(sheet.locator('input[name="system.recoil"]')).toHaveCount(0);
    });

    test('weapon sheet — skill drop hint, no effects tab', async ({ page }) => {
        const itemId = await createWorldItem(page, 'weapon', {
            attackType: 'ranged',
            skill: '',
            damage: '1d10'
        });
        const sheet = await openItemSheet(page, itemId);

        await expect(sheet.locator('.sla-drop.skill-link-box')).toBeVisible();
        await expect(sheet.locator('.sla-drop__hint')).toHaveText('Drop Skill Item Here');
        // Issue #363: nothing ever applied a weapon's embedded effects to the actor, so the tab
        // is removed rather than leaving a control on the sheet that silently does nothing.
        await expect(sheet.locator('nav.sheet-tabs a[data-tab="effects"]')).toHaveCount(0);
    });

    test('magazine sheet — weapon drop hint', async ({ page }) => {
        const itemId = await createWorldItem(page, 'magazine', {
            capacity: 30,
            linkedWeapon: ''
        });
        const sheet = await openItemSheet(page, itemId);

        await expect(sheet.locator('.sla-drop.weapon-link')).toBeVisible();
        await expect(sheet.locator('.sla-drop__hint')).toHaveText('Drop Weapon Here');
    });

    test('armor sheet — shield checkbox reveals melee/ranged PV fields and hides generic PV', async ({ page }) => {
        const itemId = await createWorldItem(page, 'armor', { pv: 6, isShield: false });
        const sheet = await openItemSheet(page, itemId);

        await expect(sheet.locator('input[name="system.pv"]')).toBeVisible();
        await expect(sheet.locator('input[name="system.pvMelee"]')).toHaveCount(0);
        await expect(sheet.locator('input[name="system.pvRanged"]')).toHaveCount(0);

        await sheet.locator('#armor-shield-toggle').check();

        await expect(sheet.locator('input[name="system.pv"]')).toHaveCount(0);
        await expect(sheet.locator('input[name="system.pvMelee"]')).toBeVisible();
        await expect(sheet.locator('input[name="system.pvRanged"]')).toBeVisible();
    });

    test('armor sheet — persists isShield/pvMelee/pvRanged via submitOnChange', async ({ page }) => {
        const itemId = await createWorldItem(page, 'armor', { pv: 0, isShield: false });
        const sheet = await openItemSheet(page, itemId);

        await sheet.locator('#armor-shield-toggle').check();
        await sheet.locator('input[name="system.pvMelee"]').fill('2');
        await sheet.locator('input[name="system.pvMelee"]').blur();
        await sheet.locator('input[name="system.pvRanged"]').fill('2');
        await sheet.locator('input[name="system.pvRanged"]').blur();

        await expect
            .poll(() =>
                page.evaluate((id) => {
                    const item = game.items.get(id);
                    return {
                        isShield: item.system.isShield,
                        pvMelee: item.system.pvMelee,
                        pvRanged: item.system.pvRanged
                    };
                }, itemId)
            )
            .toEqual({ isShield: true, pvMelee: 2, pvRanged: 2 });
    });

    test('armor sheet — no effects tab', async ({ page }) => {
        const itemId = await createWorldItem(page, 'armor', { pv: 6, isShield: false });
        const sheet = await openItemSheet(page, itemId);

        await expect(sheet.locator('nav.sheet-tabs a[data-tab="effects"]')).toHaveCount(0);
    });

    test('skill sheet — field manual stamp, two tabs only', async ({ page }) => {
        const itemId = await createWorldItem(page, 'skill', { rank: 1 });
        const sheet = await openItemSheet(page, itemId);

        await expect(sheet.locator('.field-manual__stamp')).toHaveText('Field Manual');
        await expect(sheet.locator('nav.sheet-tabs a[data-tab="effects"]')).toHaveCount(0);
    });

    test('trait sheet — annotation stamp, three tabs including effects', async ({ page }) => {
        const itemId = await createWorldItem(page, 'trait', { rank: 1 });
        const sheet = await openItemSheet(page, itemId);

        await expect(sheet.locator('.personnel-annotation__stamp')).toBeVisible();
        await expect(sheet.locator('nav.sheet-tabs a[data-tab="attributes"]')).toBeVisible();
        await expect(sheet.locator('nav.sheet-tabs a[data-tab="description"]')).toBeVisible();
        await clickItemSheetTab(sheet, 'effects');
        await expect(sheet.locator('.sla-item-effects .sla-section__title')).toHaveText('Active Effects');
        await expect(sheet.locator('.sla-item-effect-create')).toBeVisible();
    });

    test('generic item sheet — inventory slip stamp', async ({ page }) => {
        const itemId = await createWorldItem(page, 'item', { weight: 1 });
        const sheet = await openItemSheet(page, itemId);

        await expect(sheet.getByText('Inventory Slip')).toBeVisible();
        await clickItemSheetTab(sheet, 'effects');
        await expect(sheet.getByText('Transferable effects apply')).toBeVisible();
    });

    test('drop zones toggle is-drag-over during dragenter', async ({ page }) => {
        const itemId = await createWorldItem(page, 'weapon', { skill: '' });
        await openItemSheet(page, itemId);

        const toggled = await page.evaluate(() => {
            const zone = document.querySelector('form.application.sla-industries.item .sla-drop');
            if (!zone) return { found: false };
            zone.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true }));
            const active = zone.classList.contains('is-drag-over');
            zone.dispatchEvent(new DragEvent('dragleave', { bubbles: true, cancelable: true }));
            return { found: true, active };
        });

        expect(toggled.found).toBe(true);
        expect(toggled.active).toBe(true);
    });

    test('effects tab — create embedded active effect', async ({ page }) => {
        const itemId = await createWorldItem(page, 'item', {});
        const sheet = await openItemSheet(page, itemId);

        await clickItemSheetTab(sheet, 'effects');
        await sheet.locator('.sla-item-effect-create').click();

        await expect(sheet.locator('.sla-item-effect-row')).toHaveCount(1);
        await expect(sheet.getByText('No active effects.')).toHaveCount(0);
    });

    test('tab rail exposes accessibility attributes', async ({ page }) => {
        const itemId = await createWorldItem(page, 'weapon', {});
        const sheet = await openItemSheet(page, itemId);

        const tablist = sheet.locator('nav.sheet-tabs[role="tablist"]');
        await expect(tablist).toBeVisible();

        const attributesTab = sheet.locator('nav.sheet-tabs a[data-tab="attributes"]');
        await expect(attributesTab).toHaveAttribute('aria-selected', 'true');
        await expect(attributesTab).toHaveAttribute('aria-controls', 'sla-item-tabpanel-attributes');

        await clickItemSheetTab(sheet, 'description');
        await expect(sheet.locator('nav.sheet-tabs a[data-tab="description"]')).toHaveAttribute(
            'aria-selected',
            'true'
        );
        await expect(sheet.locator('nav.sheet-tabs a[data-tab="attributes"]')).toHaveAttribute(
            'aria-selected',
            'false'
        );
    });
});
