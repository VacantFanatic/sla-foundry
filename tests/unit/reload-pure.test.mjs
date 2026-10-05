/**
 * Unit tests for pure reload helpers (no Foundry runtime).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildReloadWeaponUpdate,
    resolveClipCapacity,
    resolveReloadCapacity
} from '../../module/sheets/actor/reload-pure.mjs';

describe('resolveClipCapacity', () => {
    test('prefers the loaded clip capacity over the weapon clip size', () => {
        assert.equal(resolveClipCapacity({ loadedCapacity: 50, maxAmmo: 30 }), 50);
    });

    test('falls back to maxAmmo when no loaded capacity is recorded', () => {
        assert.equal(resolveClipCapacity({ loadedCapacity: 0, maxAmmo: 30 }), 30);
        assert.equal(resolveClipCapacity({ maxAmmo: 30 }), 30);
    });

    test('returns 0 when the weapon has neither', () => {
        assert.equal(resolveClipCapacity({}), 0);
        assert.equal(resolveClipCapacity(undefined), 0);
    });
});

describe('resolveReloadCapacity', () => {
    test('uses the clip override when set', () => {
        assert.equal(resolveReloadCapacity({ ammoCapacity: 50 }, { maxAmmo: 30 }), 50);
    });

    test("uses the weapon's clip size when the clip has no override", () => {
        assert.equal(resolveReloadCapacity({ ammoCapacity: 0 }, { maxAmmo: 30 }), 30);
        assert.equal(resolveReloadCapacity({}, { maxAmmo: 30 }), 30);
    });

    test('defaults to 10 when neither the clip nor the weapon has a size', () => {
        assert.equal(resolveReloadCapacity({}, {}), 10);
        assert.equal(resolveReloadCapacity(undefined, undefined), 10);
    });
});

describe('buildReloadWeaponUpdate', () => {
    test('sets ammo and loadedCapacity to the clip override', () => {
        const update = buildReloadWeaponUpdate({ ammoCapacity: 12, ammoType: 'standard' }, { maxAmmo: 30 });
        assert.equal(update['system.ammo'], 12);
        assert.equal(update['system.loadedCapacity'], 12);
    });

    test("uses the weapon's clip size when the clip has no override", () => {
        const update = buildReloadWeaponUpdate({ ammoType: 'standard' }, { maxAmmo: 30 });
        assert.equal(update['system.ammo'], 30);
        assert.equal(update['system.loadedCapacity'], 30);
    });

    test('defaults capacity to 10 when neither the clip nor the weapon has a size', () => {
        const update = buildReloadWeaponUpdate({ ammoType: 'standard' });
        assert.equal(update['system.ammo'], 10);
        assert.equal(update['system.loadedCapacity'], 10);
    });

    test("never overwrites the weapon's configured clip size", () => {
        const update = buildReloadWeaponUpdate({ ammoCapacity: 50 }, { maxAmmo: 30 });
        assert.ok(!('system.maxAmmo' in update));
    });

    test('snapshots the clip ammoType onto the weapon', () => {
        const update = buildReloadWeaponUpdate({ ammoCapacity: 30, ammoType: 'ap' }, { maxAmmo: 30 });
        assert.equal(update['system.ammoType'], 'ap');
    });

    test('defaults ammoType to standard when the clip has none', () => {
        const update = buildReloadWeaponUpdate({ ammoCapacity: 30 }, { maxAmmo: 30 });
        assert.equal(update['system.ammoType'], 'standard');
    });

    test('defaults ammoType to standard when the clip ammoType is empty', () => {
        const update = buildReloadWeaponUpdate({ ammoCapacity: 30, ammoType: '' }, { maxAmmo: 30 });
        assert.equal(update['system.ammoType'], 'standard');
    });
});
