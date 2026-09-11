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
    test('returns 0 when weapon has no ammoType set (never reloaded)', () => {
        assert.equal(getAmmoDamageModifierForWeapon({ system: {} }, AMMO_MODIFIERS), 0);
    });

    test('returns 0 when weapon ammoType is empty string', () => {
        assert.equal(getAmmoDamageModifierForWeapon({ system: { ammoType: '' } }, AMMO_MODIFIERS), 0);
    });

    test('standard ammo gives 0 damage modifier', () => {
        assert.equal(getAmmoDamageModifierForWeapon({ system: { ammoType: 'standard' } }, AMMO_MODIFIERS), 0);
    });

    test('HE ammo gives +1 damage modifier', () => {
        assert.equal(getAmmoDamageModifierForWeapon({ system: { ammoType: 'he' } }, AMMO_MODIFIERS), 1);
    });

    test('AP ammo gives 0 damage modifier (PV reduction is applied at target, not pre-roll)', () => {
        assert.equal(getAmmoDamageModifierForWeapon({ system: { ammoType: 'ap' } }, AMMO_MODIFIERS), 0);
    });

    test('shotgun_slug gives +1 damage modifier', () => {
        assert.equal(getAmmoDamageModifierForWeapon({ system: { ammoType: 'shotgun_slug' } }, AMMO_MODIFIERS), 1);
    });

    test('shotgun_std gives 0 damage modifier', () => {
        assert.equal(getAmmoDamageModifierForWeapon({ system: { ammoType: 'shotgun_std' } }, AMMO_MODIFIERS), 0);
    });

    test('unknown ammo type not in config returns 0', () => {
        assert.equal(getAmmoDamageModifierForWeapon({ system: { ammoType: 'plasma' } }, AMMO_MODIFIERS), 0);
    });
});

// ─── getAmmoAdModifierForWeapon ──────────────────────────────────────────────

describe('getAmmoAdModifierForWeapon', () => {
    test('returns 0 when weapon has no ammoType set (never reloaded)', () => {
        assert.equal(getAmmoAdModifierForWeapon({ system: {} }, AMMO_MODIFIERS), 0);
    });

    test('HE ammo gives +1 AD modifier', () => {
        assert.equal(getAmmoAdModifierForWeapon({ system: { ammoType: 'he' } }, AMMO_MODIFIERS), 1);
    });

    test('shotgun_slug gives -1 AD modifier', () => {
        assert.equal(getAmmoAdModifierForWeapon({ system: { ammoType: 'shotgun_slug' } }, AMMO_MODIFIERS), -1);
    });

    test('AP ammo gives 0 AD modifier', () => {
        assert.equal(getAmmoAdModifierForWeapon({ system: { ammoType: 'ap' } }, AMMO_MODIFIERS), 0);
    });
});

// ─── getAmmoPvModifierForWeapon ──────────────────────────────────────────────

describe('getAmmoPvModifierForWeapon', () => {
    test('returns 0 when weapon has no ammoType set (never reloaded)', () => {
        assert.equal(getAmmoPvModifierForWeapon({ system: {} }, AMMO_MODIFIERS), 0);
    });

    test('AP ammo gives -2 PV modifier', () => {
        assert.equal(getAmmoPvModifierForWeapon({ system: { ammoType: 'ap' } }, AMMO_MODIFIERS), -2);
    });

    test('HE ammo gives 0 PV modifier', () => {
        assert.equal(getAmmoPvModifierForWeapon({ system: { ammoType: 'he' } }, AMMO_MODIFIERS), 0);
    });

    test('unknown ammo type not in config returns 0', () => {
        assert.equal(getAmmoPvModifierForWeapon({ system: { ammoType: 'plasma' } }, AMMO_MODIFIERS), 0);
    });
});

// ─── getLoadedAmmoNameForWeapon ──────────────────────────────────────────────

describe('getLoadedAmmoNameForWeapon', () => {
    test('returns null when weapon has no ammoType set (never reloaded)', () => {
        assert.equal(getLoadedAmmoNameForWeapon({ system: {} }, AMMO_TYPES), null);
    });

    test('returns null when weapon ammoType is empty string', () => {
        assert.equal(getLoadedAmmoNameForWeapon({ system: { ammoType: '' } }, AMMO_TYPES), null);
    });

    test('returns display name for standard ammo', () => {
        assert.equal(getLoadedAmmoNameForWeapon({ system: { ammoType: 'standard' } }, AMMO_TYPES), 'Standard');
    });

    test('returns display name for HE ammo', () => {
        assert.equal(getLoadedAmmoNameForWeapon({ system: { ammoType: 'he' } }, AMMO_TYPES), 'High Explosive (HE)');
    });

    test('returns display name for AP ammo', () => {
        assert.equal(getLoadedAmmoNameForWeapon({ system: { ammoType: 'ap' } }, AMMO_TYPES), 'Armour Piercing (AP)');
    });

    test('unknown ammo type not in config returns null', () => {
        assert.equal(getLoadedAmmoNameForWeapon({ system: { ammoType: 'plasma' } }, AMMO_TYPES), null);
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
