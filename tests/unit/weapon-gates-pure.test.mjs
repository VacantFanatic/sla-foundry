/**
 * Unit tests for pure weapon gate helpers (no Foundry runtime).
 *
 * Spec: DEVELOPER.md §Combat Flow, §Ammo Types and Modifiers
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
    requiresWeaponEquippedForAttack,
    getAmmoDamageModifierForWeapon,
    getAmmoAdModifierForWeapon,
    getAmmoPvModifierForWeapon,
    getLoadedAmmoNameForWeapon,
    resolveWeaponAdForDamageRoll
} from '../../module/sheets/actor/weapon-gates-pure.mjs';

// Real ammo modifiers from module/config.mjs
const AMMO_MODIFIERS = {
    standard: { damage: 0, ad: 0, pv: 0 },
    he: { damage: 1, ad: 1, pv: 0 },
    ap: { damage: 0, ad: 0, pv: -2 },
    shotgun_std: { damage: 0, ad: 0, pv: 0 },
    shotgun_slug: { damage: 1, ad: -1, pv: 0 }
};

// Real ammo type display labels from module/config.mjs
const AMMO_TYPES = {
    standard: 'Standard',
    he: 'High Explosive (HE)',
    ap: 'Armour Piercing (AP)',
    shotgun_std: 'Shotgun Shot (Standard)',
    shotgun_slug: 'Shotgun Slug'
};

// ─── requiresWeaponEquippedForAttack ─────────────────────────────────────────

describe('requiresWeaponEquippedForAttack', () => {
    test('returns true for character actors', () => {
        assert.equal(requiresWeaponEquippedForAttack({ type: 'character' }), true);
    });

    test('returns false for npc actors — NPCs may attack with unequipped weapons', () => {
        assert.equal(requiresWeaponEquippedForAttack({ type: 'npc' }), false);
    });

    test('returns false for vehicle actors', () => {
        assert.equal(requiresWeaponEquippedForAttack({ type: 'vehicle' }), false);
    });
});

// ─── getAmmoDamageModifierForWeapon ──────────────────────────────────────────

describe('getAmmoDamageModifierForWeapon', () => {
    function makeActor(magazine) {
        return { items: { get: (id) => (id === magazine?.id ? magazine : null) } };
    }

    test('returns 0 when item has no magazineId', () => {
        assert.equal(getAmmoDamageModifierForWeapon(makeActor(null), { system: {} }, AMMO_MODIFIERS), 0);
    });

    test('returns 0 when actor is null', () => {
        assert.equal(getAmmoDamageModifierForWeapon(null, { system: { magazineId: 'x' } }, AMMO_MODIFIERS), 0);
    });

    test('returns 0 when magazine is not found in actor inventory', () => {
        assert.equal(
            getAmmoDamageModifierForWeapon(makeActor(null), { system: { magazineId: 'missing' } }, AMMO_MODIFIERS),
            0
        );
    });

    test('standard ammo gives 0 damage modifier', () => {
        const mag = { id: 'm1', system: { ammoType: 'standard' } };
        assert.equal(
            getAmmoDamageModifierForWeapon(makeActor(mag), { system: { magazineId: 'm1' } }, AMMO_MODIFIERS),
            0
        );
    });

    test('HE ammo gives +1 damage modifier', () => {
        const mag = { id: 'm2', system: { ammoType: 'he' } };
        assert.equal(
            getAmmoDamageModifierForWeapon(makeActor(mag), { system: { magazineId: 'm2' } }, AMMO_MODIFIERS),
            1
        );
    });

    test('AP ammo gives 0 damage modifier (PV reduction is applied at target, not pre-roll)', () => {
        const mag = { id: 'm3', system: { ammoType: 'ap' } };
        assert.equal(
            getAmmoDamageModifierForWeapon(makeActor(mag), { system: { magazineId: 'm3' } }, AMMO_MODIFIERS),
            0
        );
    });

    test('shotgun_slug gives +1 damage modifier', () => {
        const mag = { id: 'm4', system: { ammoType: 'shotgun_slug' } };
        assert.equal(
            getAmmoDamageModifierForWeapon(makeActor(mag), { system: { magazineId: 'm4' } }, AMMO_MODIFIERS),
            1
        );
    });

    test('shotgun_std gives 0 damage modifier', () => {
        const mag = { id: 'm5', system: { ammoType: 'shotgun_std' } };
        assert.equal(
            getAmmoDamageModifierForWeapon(makeActor(mag), { system: { magazineId: 'm5' } }, AMMO_MODIFIERS),
            0
        );
    });

    test('unknown ammo type not in config returns 0', () => {
        const mag = { id: 'm6', system: { ammoType: 'plasma' } };
        assert.equal(
            getAmmoDamageModifierForWeapon(makeActor(mag), { system: { magazineId: 'm6' } }, AMMO_MODIFIERS),
            0
        );
    });

    test('missing ammoType on magazine defaults to standard (0)', () => {
        const mag = { id: 'm7', system: {} };
        assert.equal(
            getAmmoDamageModifierForWeapon(makeActor(mag), { system: { magazineId: 'm7' } }, AMMO_MODIFIERS),
            0
        );
    });
});

// ─── getAmmoAdModifierForWeapon ──────────────────────────────────────────────

describe('getAmmoAdModifierForWeapon', () => {
    function makeActor(magazine) {
        return { items: { get: (id) => (id === magazine?.id ? magazine : null) } };
    }

    test('returns 0 when item has no magazineId', () => {
        assert.equal(getAmmoAdModifierForWeapon(makeActor(null), { system: {} }, AMMO_MODIFIERS), 0);
    });

    test('HE ammo gives +1 AD modifier', () => {
        const mag = { id: 'm1', system: { ammoType: 'he' } };
        assert.equal(getAmmoAdModifierForWeapon(makeActor(mag), { system: { magazineId: 'm1' } }, AMMO_MODIFIERS), 1);
    });

    test('shotgun_slug gives -1 AD modifier', () => {
        const mag = { id: 'm2', system: { ammoType: 'shotgun_slug' } };
        assert.equal(getAmmoAdModifierForWeapon(makeActor(mag), { system: { magazineId: 'm2' } }, AMMO_MODIFIERS), -1);
    });

    test('AP ammo gives 0 AD modifier', () => {
        const mag = { id: 'm3', system: { ammoType: 'ap' } };
        assert.equal(getAmmoAdModifierForWeapon(makeActor(mag), { system: { magazineId: 'm3' } }, AMMO_MODIFIERS), 0);
    });
});

// ─── getAmmoPvModifierForWeapon ──────────────────────────────────────────────

describe('getAmmoPvModifierForWeapon', () => {
    function makeActor(magazine) {
        return { items: { get: (id) => (id === magazine?.id ? magazine : null) } };
    }

    test('returns 0 when item has no magazineId', () => {
        assert.equal(getAmmoPvModifierForWeapon(makeActor(null), { system: {} }, AMMO_MODIFIERS), 0);
    });

    test('AP ammo gives -2 PV modifier', () => {
        const mag = { id: 'm1', system: { ammoType: 'ap' } };
        assert.equal(getAmmoPvModifierForWeapon(makeActor(mag), { system: { magazineId: 'm1' } }, AMMO_MODIFIERS), -2);
    });

    test('HE ammo gives 0 PV modifier', () => {
        const mag = { id: 'm2', system: { ammoType: 'he' } };
        assert.equal(getAmmoPvModifierForWeapon(makeActor(mag), { system: { magazineId: 'm2' } }, AMMO_MODIFIERS), 0);
    });

    test('unknown ammo type not in config returns 0', () => {
        const mag = { id: 'm3', system: { ammoType: 'plasma' } };
        assert.equal(getAmmoPvModifierForWeapon(makeActor(mag), { system: { magazineId: 'm3' } }, AMMO_MODIFIERS), 0);
    });
});

// ─── getLoadedAmmoNameForWeapon ──────────────────────────────────────────────

describe('getLoadedAmmoNameForWeapon', () => {
    function makeActor(magazine) {
        return { items: { get: (id) => (id === magazine?.id ? magazine : null) } };
    }

    test('returns null when item has no magazineId', () => {
        assert.equal(getLoadedAmmoNameForWeapon(makeActor(null), { system: {} }, AMMO_TYPES), null);
    });

    test('returns null when actor is null', () => {
        assert.equal(getLoadedAmmoNameForWeapon(null, { system: { magazineId: 'x' } }, AMMO_TYPES), null);
    });

    test('returns null when magazine is not found in actor inventory', () => {
        assert.equal(
            getLoadedAmmoNameForWeapon(makeActor(null), { system: { magazineId: 'missing' } }, AMMO_TYPES),
            null
        );
    });

    test('returns display name for standard ammo', () => {
        const mag = { id: 'm1', system: { ammoType: 'standard' } };
        assert.equal(
            getLoadedAmmoNameForWeapon(makeActor(mag), { system: { magazineId: 'm1' } }, AMMO_TYPES),
            'Standard'
        );
    });

    test('returns display name for HE ammo', () => {
        const mag = { id: 'm2', system: { ammoType: 'he' } };
        assert.equal(
            getLoadedAmmoNameForWeapon(makeActor(mag), { system: { magazineId: 'm2' } }, AMMO_TYPES),
            'High Explosive (HE)'
        );
    });

    test('returns display name for AP ammo', () => {
        const mag = { id: 'm3', system: { ammoType: 'ap' } };
        assert.equal(
            getLoadedAmmoNameForWeapon(makeActor(mag), { system: { magazineId: 'm3' } }, AMMO_TYPES),
            'Armour Piercing (AP)'
        );
    });

    test("missing ammoType on magazine defaults to standard's display name", () => {
        const mag = { id: 'm4', system: {} };
        assert.equal(
            getLoadedAmmoNameForWeapon(makeActor(mag), { system: { magazineId: 'm4' } }, AMMO_TYPES),
            'Standard'
        );
    });

    test('unknown ammo type not in config returns null', () => {
        const mag = { id: 'm5', system: { ammoType: 'plasma' } };
        assert.equal(getLoadedAmmoNameForWeapon(makeActor(mag), { system: { magazineId: 'm5' } }, AMMO_TYPES), null);
    });
});

// ─── resolveWeaponAdForDamageRoll ─────────────────────────────────────────────

describe('resolveWeaponAdForDamageRoll', () => {
    function makeActor(strTotal) {
        return { system: { stats: { str: { total: strTotal } } } };
    }

    test('returns item.system.ad for non-powersuit weapons', () => {
        assert.equal(resolveWeaponAdForDamageRoll(makeActor(5), { system: { ad: 3, powersuitAttack: false } }), 3);
    });

    test('returns 0 when item has no ad field', () => {
        assert.equal(resolveWeaponAdForDamageRoll(makeActor(5), { system: { powersuitAttack: false } }), 0);
    });

    test('powersuit attack: AD = STR total − adFromStrMinus', () => {
        assert.equal(
            resolveWeaponAdForDamageRoll(makeActor(8), { system: { ad: 0, powersuitAttack: true, adFromStrMinus: 3 } }),
            5 // 8 − 3
        );
    });

    test('powersuit attack: AD is floored at 0 when STR is below threshold', () => {
        assert.equal(
            resolveWeaponAdForDamageRoll(makeActor(2), { system: { ad: 0, powersuitAttack: true, adFromStrMinus: 5 } }),
            0 // Math.max(0, 2 − 5)
        );
    });

    test('powersuit attack with adFromStrMinus 0 falls back to item ad', () => {
        // adFromStrMinus = 0 means no STR-derived override
        assert.equal(
            resolveWeaponAdForDamageRoll(makeActor(7), { system: { ad: 4, powersuitAttack: true, adFromStrMinus: 0 } }),
            4
        );
    });

    test('falls back to str.value when str.total is absent', () => {
        const actor = { system: { stats: { str: { value: 6 } } } };
        assert.equal(
            resolveWeaponAdForDamageRoll(actor, { system: { ad: 0, powersuitAttack: true, adFromStrMinus: 2 } }),
            4 // 6 − 2
        );
    });
});
