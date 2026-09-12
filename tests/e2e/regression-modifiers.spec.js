/**
 * E2E coverage for module/helpers/modifiers.mjs's ranged-attack helpers
 * (applyRangedModifiers, calculateRangePenalty). applyMeleeModifiers is
 * already covered by tests/unit/modifiers.test.mjs; these two are
 * Foundry/jQuery/canvas-dependent and were previously untested.
 */
const { test, expect } = require('@playwright/test');
const { joinGame, waitForSLASystem } = require('./fixtures');

const needsAuth = () => {
    test.skip(!process.env.FOUNDRY_USER, 'Set FOUNDRY_USER (and FOUNDRY_URL / FOUNDRY_PASSWORD if needed)');
};

test.describe('GM: applyRangedModifiers (document API)', () => {
    test.beforeEach(async ({ page }) => {
        needsAuth();
        await joinGame(page);
        await waitForSLASystem(page);
        const gm = await page.evaluate(() => game.user?.isGM === true);
        test.skip(!gm, 'Requires GM — use a Gamemaster account for FOUNDRY_USER');
    });

    test('blocks firing a mode that costs more rounds than the lowest active mode has ammo for', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [weapon] = await Item.createDocuments([
                {
                    name: `E2E Ranged Blocked ${stamp}`,
                    type: 'weapon',
                    system: {
                        ammo: 0,
                        firingModes: {
                            single: { label: 'Single', active: true, rounds: 1, recoil: 0 },
                            burst: { label: 'Burst', active: true, rounds: 3, recoil: 1 }
                        }
                    }
                }
            ]);

            const original = game.settings.get('sla-industries', 'enableLowAmmoValidation');
            await game.settings.set('sla-industries', 'enableLowAmmoValidation', true);

            // Mirrors the real attack-dialog template: a #fire-mode <select> whose options carry
            // data-rounds/data-recoil, which applyRangedModifiers reads via jQuery .data().
            const form = document.createElement('form');
            const select = document.createElement('select');
            select.id = 'fire-mode';
            select.innerHTML =
                '<option value="single" data-rounds="1" data-recoil="0">Single</option>' +
                '<option value="burst" data-rounds="3" data-recoil="1">Burst</option>';
            form.appendChild(select);
            select.value = 'burst';

            const mods = { damage: 0, successDie: 0, allDice: 0, rank: 0, autoSkillSuccesses: 0 };
            const notes = [];
            const flags = {};

            const { applyRangedModifiers } = await import('/systems/sla-industries/module/helpers/modifiers.mjs');
            const proceeded = await applyRangedModifiers(weapon, form, mods, notes, flags);

            await game.settings.set('sla-industries', 'enableLowAmmoValidation', original);
            await weapon.delete();
            return { proceeded, mods };
        });

        expect(result.proceeded).toBe(false);
        expect(result.mods.damage).toBe(0);
    });

    test('applies the -2 low-ammo penalty when firing the lowest mode with insufficient ammo', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [weapon] = await Item.createDocuments([
                {
                    name: `E2E Ranged LowAmmo ${stamp}`,
                    type: 'weapon',
                    system: {
                        ammo: 0,
                        firingModes: { single: { label: 'Single', active: true, rounds: 1, recoil: 0 } }
                    }
                }
            ]);

            const original = game.settings.get('sla-industries', 'enableLowAmmoValidation');
            await game.settings.set('sla-industries', 'enableLowAmmoValidation', true);

            const form = document.createElement('form');
            const select = document.createElement('select');
            select.id = 'fire-mode';
            select.innerHTML = '<option value="single" data-rounds="1" data-recoil="0">Single</option>';
            form.appendChild(select);
            select.value = 'single';

            const mods = { damage: 0, successDie: 0, allDice: 0, rank: 0, autoSkillSuccesses: 0 };
            const notes = [];
            const flags = {};

            const { applyRangedModifiers } = await import('/systems/sla-industries/module/helpers/modifiers.mjs');
            const proceeded = await applyRangedModifiers(weapon, form, mods, notes, flags);

            await game.settings.set('sla-industries', 'enableLowAmmoValidation', original);
            await weapon.delete();
            return { proceeded, mods, notes };
        });

        expect(result.proceeded).toBe(true);
        expect(result.mods.damage).toBe(-2);
        expect(result.notes).toContain('Low Ammo (-2 DMG).');
    });

    test('burst mode applies its damage/recoil bonuses and consumes real ammo', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [weapon] = await Item.createDocuments([
                {
                    name: `E2E Ranged Burst ${stamp}`,
                    type: 'weapon',
                    system: {
                        ammo: 10,
                        firingModes: {
                            single: { label: 'Single', active: true, rounds: 1, recoil: 0 },
                            burst: { label: 'Burst', active: true, rounds: 3, recoil: 1 }
                        }
                    }
                }
            ]);

            const originalAmmoConsumption = game.settings.get('sla-industries', 'enableAutomaticAmmoConsumption');
            await game.settings.set('sla-industries', 'enableAutomaticAmmoConsumption', true);

            const form = document.createElement('form');
            const select = document.createElement('select');
            select.id = 'fire-mode';
            select.innerHTML =
                '<option value="single" data-rounds="1" data-recoil="0">Single</option>' +
                '<option value="burst" data-rounds="3" data-recoil="1">Burst</option>';
            form.appendChild(select);
            select.value = 'burst';

            const mods = { damage: 0, successDie: 0, allDice: 0, rank: 0, autoSkillSuccesses: 0 };
            const notes = [];
            const flags = {};

            const { applyRangedModifiers } = await import('/systems/sla-industries/module/helpers/modifiers.mjs');
            const proceeded = await applyRangedModifiers(weapon, form, mods, notes, flags);

            await game.settings.set('sla-industries', 'enableAutomaticAmmoConsumption', originalAmmoConsumption);
            const persistedAmmo = game.items.get(weapon.id).system.ammo;
            await weapon.delete();
            return { proceeded, mods, notes, flags, persistedAmmo };
        });

        expect(result.proceeded).toBe(true);
        expect(result.mods.damage).toBe(2);
        expect(result.mods.successDie).toBe(-1);
        expect(result.notes).toContain('Burst (+2 Dmg).');
        expect(result.notes).toContain('Recoil -1 SD.');
        expect(result.flags.rerollSD).toBe(true);
        expect(result.persistedAmmo).toBe(7);
    });
});

test.describe('calculateRangePenalty (document API, stubbed canvas.grid)', () => {
    test.beforeEach(async ({ page }) => {
        needsAuth();
        await joinGame(page);
        await waitForSLASystem(page);
    });

    test('flags long range once distance exceeds half the weapon max range', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const originalGrid = canvas.grid;
            canvas.grid = { measurePath: () => ({ distance: 12 }) };

            const { calculateRangePenalty } = await import('/systems/sla-industries/module/helpers/modifiers.mjs');
            const longRange = calculateRangePenalty({}, {}, 20); // half of 20 is 10, distance 12 > 10
            const shortRange = calculateRangePenalty({}, {}, 30); // half of 30 is 15, distance 12 < 15

            canvas.grid = originalGrid;
            return { longRange, shortRange };
        });

        expect(result.longRange).toEqual({ isLongRange: true, penaltyMsg: 'Long Range (-1 Skill Die)' });
        expect(result.shortRange).toEqual({ isLongRange: false, penaltyMsg: '' });
    });

    test('returns no penalty when token or target is missing', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const { calculateRangePenalty } = await import('/systems/sla-industries/module/helpers/modifiers.mjs');
            return calculateRangePenalty(null, {}, 20);
        });

        expect(result).toEqual({ isLongRange: false, penaltyMsg: '' });
    });
});
