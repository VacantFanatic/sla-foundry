/**
 * Unit tests for pure species-name lookups used by species add/remove (no Foundry runtime).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { NATURAL_WEAPONS } from '../../module/data/natural-weapons.mjs';
import {
    resolveNaturalWeaponForSpecies,
    resolveSpeciesDefaults
} from '../../module/documents/actor/species-lifecycle-pure.mjs';

describe('resolveNaturalWeaponForSpecies', () => {
    test('stormer variants grant Teeth/Claws', () => {
        assert.equal(resolveNaturalWeaponForSpecies('stormer 313 (malice)'), NATURAL_WEAPONS.teethClaws);
    });

    test('neophron grants Beak', () => {
        assert.equal(resolveNaturalWeaponForSpecies('neophron'), NATURAL_WEAPONS.beak);
    });

    test('other species grant nothing', () => {
        assert.equal(resolveNaturalWeaponForSpecies('human'), null);
        assert.equal(resolveNaturalWeaponForSpecies('ebon'), null);
    });
});

describe('resolveSpeciesDefaults', () => {
    test('ebon sets flux/hp/move but not luck', () => {
        assert.deepEqual(resolveSpeciesDefaults('ebon'), {
            fluxInit: 2,
            fluxMax: 6,
            hpBase: 14,
            moveClosing: 2,
            moveRushing: 5
        });
    });

    test('human sets luck/hp/move but not flux', () => {
        assert.deepEqual(resolveSpeciesDefaults('human'), {
            luckInit: 1,
            luckMax: 6,
            hpBase: 14,
            moveClosing: 2,
            moveRushing: 5
        });
    });

    test('frother', () => {
        assert.deepEqual(resolveSpeciesDefaults('frother'), {
            luckInit: 1,
            luckMax: 3,
            hpBase: 15,
            moveClosing: 2,
            moveRushing: 5
        });
    });

    test('wraithen', () => {
        assert.deepEqual(resolveSpeciesDefaults('wraithen'), {
            luckInit: 1,
            luckMax: 4,
            hpBase: 14,
            moveClosing: 4,
            moveRushing: 8
        });
    });

    test('shaktar', () => {
        assert.deepEqual(resolveSpeciesDefaults('shaktar'), {
            luckInit: 0,
            luckMax: 3,
            hpBase: 19,
            moveClosing: 3,
            moveRushing: 6
        });
    });

    test('carrien (advanced)', () => {
        assert.deepEqual(resolveSpeciesDefaults('advanced carrien'), {
            luckInit: 0,
            luckMax: 3,
            hpBase: 20,
            moveClosing: 4,
            moveRushing: 7
        });
    });

    test('neophron', () => {
        assert.deepEqual(resolveSpeciesDefaults('neophron'), {
            luckInit: 0,
            luckMax: 3,
            hpBase: 11,
            moveClosing: 2,
            moveRushing: 5
        });
    });

    test('stormer 313/malice', () => {
        const expected = { luckInit: 0, luckMax: 2, hpBase: 22, moveClosing: 3, moveRushing: 6 };
        assert.deepEqual(resolveSpeciesDefaults('stormer 313'), expected);
        assert.deepEqual(resolveSpeciesDefaults('stormer malice'), expected);
    });

    test('stormer 711/xeno', () => {
        const expected = { luckInit: 0, luckMax: 2, hpBase: 20, moveClosing: 4, moveRushing: 6 };
        assert.deepEqual(resolveSpeciesDefaults('stormer 711'), expected);
        assert.deepEqual(resolveSpeciesDefaults('stormer xeno'), expected);
    });

    test('stormer default (no 313/malice/711/xeno)', () => {
        assert.deepEqual(resolveSpeciesDefaults('stormer'), {
            luckInit: 0,
            luckMax: 2,
            hpBase: 20,
            moveClosing: 3,
            moveRushing: 6
        });
    });

    test('unknown species returns null', () => {
        assert.equal(resolveSpeciesDefaults('some unrecognized species'), null);
    });
});
