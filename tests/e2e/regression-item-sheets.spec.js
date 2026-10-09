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

    test('weapon sheet — skill drop hint, effects tab', async ({ page }) => {
        const itemId = await createWorldItem(page, 'weapon', {
            attackType: 'ranged',
            skill: '',
            damage: '1d10'
        });
        const sheet = await openItemSheet(page, itemId);

        await expect(sheet.locator('.sla-drop.skill-link-box')).toBeVisible();
        await expect(sheet.locator('.sla-drop__hint')).toHaveText('Drop Skill Item Here');
        // Weapons are equip-gated: SlaItem#setEquipped copies their embedded effects onto the actor.
        await clickItemSheetTab(sheet, 'effects');
        await sheet.locator('.sla-item-effect-create').click();
        await expect(sheet.locator('.sla-item-effect-row')).toHaveCount(1);
    });

    test('ranged weapon sheet — Clip Size and Loaded fields persist; melee hides them', async ({ page }) => {
        const itemId = await createWorldItem(page, 'weapon', { attackType: 'ranged', maxAmmo: 10, ammo: 10 });
        const sheet = await openItemSheet(page, itemId);

        const clipSize = sheet.locator('input[name="system.maxAmmo"]');
        await expect(clipSize).toBeVisible();
        await expect(clipSize).toHaveValue('10');
        await expect(sheet.locator('input[name="system.ammo"]')).toBeVisible();

        await clipSize.fill('30');
        await clipSize.blur();
        await expect.poll(() => page.evaluate((id) => game.items.get(id)?.system.maxAmmo, itemId)).toBe(30);

        await sheet.locator('select[name="system.attackType"]').selectOption('melee');
        await expect(sheet.locator('input[name="system.maxAmmo"]')).toHaveCount(0);
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

    test('armor sheet — effects tab', async ({ page }) => {
        const itemId = await createWorldItem(page, 'armor', { pv: 6, isShield: false });
        const sheet = await openItemSheet(page, itemId);

        await clickItemSheetTab(sheet, 'effects');
        await sheet.locator('.sla-item-effect-create').click();
        await expect(sheet.locator('.sla-item-effect-row')).toHaveCount(1);
    });

    test('explosive and magazine sheets — still no effects tab (no equip trigger)', async ({ page }) => {
        for (const type of ['explosive', 'magazine']) {
            const itemId = await createWorldItem(page, type, {});
            const sheet = await openItemSheet(page, itemId);
            await expect(sheet.locator('nav.sheet-tabs a[data-tab="effects"]')).toHaveCount(0);
            await closeApplicationWindows(page);
        }
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
        await expect(sheet.getByText('These effects are copied onto the owning actor')).toBeVisible();
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

    test('effects tab — rows show change summary and disabled state', async ({ page }) => {
        const itemId = await createWorldItem(page, 'item', {});
        await page.evaluate(async (id) => {
            const item = game.items.get(id);
            await item.createEmbeddedDocuments('ActiveEffect', [
                {
                    name: 'E2E Live Bonus',
                    img: 'icons/svg/aura.svg',
                    changes: [{ key: 'system.stats.str.bonus', type: 'add', value: '2' }]
                },
                {
                    name: 'E2E Off Bonus',
                    img: 'icons/svg/aura.svg',
                    disabled: true,
                    changes: [{ key: 'system.rollModifier.bonus', type: 'override', value: '1' }]
                }
            ]);
        }, itemId);
        const sheet = await openItemSheet(page, itemId);
        await clickItemSheetTab(sheet, 'effects');

        const live = sheet.locator('.sla-item-effect-row', { hasText: 'E2E Live Bonus' });
        await expect(live.locator('.sla-effect-change')).toHaveText('system.stats.str.bonus +2');
        await expect(live.locator('.sla-effect-disabled-badge')).toHaveCount(0);

        const off = sheet.locator('.sla-item-effect-row', { hasText: 'E2E Off Bonus' });
        await expect(off.locator('.sla-effect-change')).toHaveText('system.rollModifier.bonus =1');
        await expect(off.locator('.sla-effect-disabled-badge')).toBeVisible();
        await expect(off.locator('h4')).toHaveClass(/is-disabled/);
    });

    test('effects tab — "when this effect applies" selector shows only for multi-trigger types', async ({ page }) => {
        test.setTimeout(240_000);
        for (const [type, expectSelect] of [
            ['weapon', true],
            ['armor', true],
            ['item', true],
            ['drug', true],
            ['ebbFormula', true],
            ['trait', false],
            ['toxicant', false]
        ]) {
            const itemId = await createWorldItem(page, type, {});
            await page.evaluate(async (id) => {
                await game.items
                    .get(id)
                    .createEmbeddedDocuments('ActiveEffect', [{ name: 'E2E Row', disabled: false }]);
            }, itemId);
            const sheet = await openItemSheet(page, itemId);
            await clickItemSheetTab(sheet, 'effects');
            await expect(sheet.locator('.sla-item-effect-row')).toHaveCount(1);
            await expect(sheet.locator('.sla-item-effect-apply-on'), `${type} selector`).toHaveCount(
                expectSelect ? 1 : 0
            );
            await closeApplicationWindows(page);
        }
    });

    test('effects tab — picking a trigger stores the flag, and Default clears it', async ({ page }) => {
        const itemId = await createWorldItem(page, 'weapon', {});
        await page.evaluate(async (id) => {
            await game.items.get(id).createEmbeddedDocuments('ActiveEffect', [{ name: 'E2E Flag', disabled: false }]);
        }, itemId);
        const sheet = await openItemSheet(page, itemId);
        await clickItemSheetTab(sheet, 'effects');

        const select = sheet.locator('.sla-item-effect-apply-on');
        await expect(select.locator('option:checked')).toHaveText('Default (While equipped)');
        await expect(select.locator('option')).toHaveText([
            'Default (While equipped)',
            'While equipped',
            'While owned'
        ]);

        const readFlag = () =>
            page.evaluate(
                (id) => game.items.get(id).effects.contents[0].getFlag('sla-industries', 'applyOn') ?? null,
                itemId
            );

        await select.selectOption('owned');
        await expect.poll(readFlag).toBe('owned');
        await expect(sheet.locator('.sla-item-effect-apply-on option:checked')).toHaveText('While owned');

        await sheet.locator('.sla-item-effect-apply-on').selectOption('');
        await expect.poll(readFlag).toBe(null);
    });

    test('effects tab — a trigger chosen in the real selector drives what reaches the actor', async ({ page }) => {
        const itemId = await createWorldItem(page, 'item', {});
        await page.evaluate(async (id) => {
            await game.items.get(id).createEmbeddedDocuments('ActiveEffect', [
                {
                    name: 'E2E While Equipped',
                    disabled: false,
                    changes: [{ key: 'system.stats.str.bonus', type: 'add', value: 2 }]
                },
                {
                    name: 'E2E Always On',
                    disabled: false,
                    changes: [{ key: 'system.stats.str.bonus', type: 'add', value: 1 }]
                }
            ]);
        }, itemId);

        // The real Effects-tab selector, not a direct flag write.
        const sheet = await openItemSheet(page, itemId);
        await clickItemSheetTab(sheet, 'effects');
        await sheet
            .locator('.sla-item-effect-row', { hasText: 'E2E Always On' })
            .locator('.sla-item-effect-apply-on')
            .selectOption('owned');
        await expect
            .poll(() =>
                page.evaluate(
                    (id) =>
                        game.items
                            .get(id)
                            .effects.find((e) => e.name === 'E2E Always On')
                            .getFlag('sla-industries', 'applyOn'),
                    itemId
                )
            )
            .toBe('owned');
        await closeApplicationWindows(page);

        const result = await page.evaluate(async (id) => {
            const [actor] = await Actor.createDocuments([
                {
                    name: `E2E Mixed Triggers ${Date.now()}`,
                    type: 'character',
                    system: { stats: { str: { value: 3, bonus: 0 } } }
                }
            ]);
            const waitFor = async (predicate) => {
                const deadline = Date.now() + 8000;
                while (Date.now() < deadline && !predicate()) await new Promise((r) => setTimeout(r, 100));
                return predicate();
            };
            const str = () => game.actors.get(actor.id).system.stats.str.total;
            const [created] = await actor.createEmbeddedDocuments('Item', [game.items.get(id).toObject()]);
            const item = actor.items.get(created.id);
            const out = {};

            // Granted: only the "owned" effect arrives.
            out.afterGrant = (await waitFor(() => str() === 4)) ? str() : `stuck at ${str()}`;
            await item.setEquipped(true);
            out.afterEquip = str();
            await item.setEquipped(false);
            out.afterUnequip = str();
            await item.delete();
            out.afterDelete = (await waitFor(() => str() === 3)) ? str() : `stuck at ${str()}`;
            await actor.delete();
            return out;
        }, itemId);

        expect(result).toEqual({ afterGrant: 4, afterEquip: 6, afterUnequip: 4, afterDelete: 3 });
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
