/**
 * Unit tests for pure reload helpers (no Foundry runtime).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReloadWeaponUpdate } from '../../module/sheets/actor/reload-pure.mjs';

describe('buildReloadWeaponUpdate', () => {
    test('sets ammo and maxAmmo to the magazine capacity', () => {
        const update = buildReloadWeaponUpdate({ ammoCapacity: 12, ammoType: 'standard' });
        assert.equal(update['system.ammo'], 12);
        assert.equal(update['system.maxAmmo'], 12);
    });

    test('defaults capacity to 10 when the magazine has none', () => {
        const update = buildReloadWeaponUpdate({ ammoType: 'standard' });
        assert.equal(update['system.ammo'], 10);
        assert.equal(update['system.maxAmmo'], 10);
    });

    test('snapshots the magazine ammoType onto the weapon', () => {
        const update = buildReloadWeaponUpdate({ ammoCapacity: 30, ammoType: 'ap' });
        assert.equal(update['system.ammoType'], 'ap');
    });

    test('defaults ammoType to standard when the magazine has none', () => {
        const update = buildReloadWeaponUpdate({ ammoCapacity: 30 });
        assert.equal(update['system.ammoType'], 'standard');
    });

    test('defaults ammoType to standard when the magazine ammoType is empty', () => {
        const update = buildReloadWeaponUpdate({ ammoCapacity: 30, ammoType: '' });
        assert.equal(update['system.ammoType'], 'standard');
    });
});
