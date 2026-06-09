/**
 * Unit tests for pure migration data helpers (no Foundry runtime).
 *
 * Spec: DEVELOPER.md §Migration System
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
    getEbbFormulaRemoveWoundsMigrationUpdate,
    getEbbFormulaMigrationUpdate,
    getVehicleActorMigrationData,
    getArmorMigrationData,
    getWeaponMigrationData,
    getSpeciesMigrationData
} from '../../module/migration/pure.mjs';

// ─── getEbbFormulaRemoveWoundsMigrationUpdate ────────────────────────────────

describe('getEbbFormulaRemoveWoundsMigrationUpdate', () => {
    test('true converts to 6', () => {
        assert.deepEqual(getEbbFormulaRemoveWoundsMigrationUpdate({ system: { removeWounds: true } }), {
            'system.removeWounds': 6
        });
    });

    test('false converts to 0', () => {
        assert.deepEqual(getEbbFormulaRemoveWoundsMigrationUpdate({ system: { removeWounds: false } }), {
            'system.removeWounds': 0
        });
    });

    test('integer in valid range 0–6 returns null (no change needed)', () => {
        for (const n of [0, 1, 3, 6]) {
            assert.equal(
                getEbbFormulaRemoveWoundsMigrationUpdate({ system: { removeWounds: n } }),
                null,
                `Expected null for removeWounds=${n}`
            );
        }
    });

    test('float is floored and returns update when result differs', () => {
        assert.deepEqual(getEbbFormulaRemoveWoundsMigrationUpdate({ system: { removeWounds: 3.7 } }), {
            'system.removeWounds': 3
        });
        assert.deepEqual(getEbbFormulaRemoveWoundsMigrationUpdate({ system: { removeWounds: 0.9 } }), {
            'system.removeWounds': 0
        });
    });

    test('integer float equal to itself returns null', () => {
        // 3.0 floors to 3 which equals 3 — no change
        assert.equal(getEbbFormulaRemoveWoundsMigrationUpdate({ system: { removeWounds: 3.0 } }), null);
    });

    test('number above 6 clamps to 6', () => {
        assert.deepEqual(getEbbFormulaRemoveWoundsMigrationUpdate({ system: { removeWounds: 10 } }), {
            'system.removeWounds': 6
        });
    });

    test('negative number clamps to 0', () => {
        assert.deepEqual(getEbbFormulaRemoveWoundsMigrationUpdate({ system: { removeWounds: -3 } }), {
            'system.removeWounds': 0
        });
    });

    test('unexpected type (string) coerces to 0', () => {
        assert.deepEqual(getEbbFormulaRemoveWoundsMigrationUpdate({ system: { removeWounds: 'yes' } }), {
            'system.removeWounds': 0
        });
    });

    test('undefined removeWounds returns null (field absent — nothing to migrate)', () => {
        assert.equal(getEbbFormulaRemoveWoundsMigrationUpdate({ system: {} }), null);
    });

    test('null removeWounds returns null', () => {
        assert.equal(getEbbFormulaRemoveWoundsMigrationUpdate({ system: { removeWounds: null } }), null);
    });
});

// ─── getEbbFormulaMigrationUpdate ─────────────────────────────────────────────

describe('getEbbFormulaMigrationUpdate', () => {
    test('migrates ebbEffect "none" → "effect"', () => {
        const result = getEbbFormulaMigrationUpdate({ system: { ebbEffect: 'none' } });
        assert.equal(result['system.ebbEffect'], 'effect');
    });

    test('leaves ebbEffect unchanged when not "none"', () => {
        for (const v of ['damage', 'heal', 'effect']) {
            const result = getEbbFormulaMigrationUpdate({ system: { ebbEffect: v } });
            assert.equal(result?.['system.ebbEffect'], undefined, `Should not migrate ebbEffect="${v}"`);
        }
    });

    test('migrates legacy ebbHpWoundMode "or" → ebbHealWoundMode "or"', () => {
        const result = getEbbFormulaMigrationUpdate({ system: { ebbHpWoundMode: 'or' } });
        assert.equal(result['system.ebbHealWoundMode'], 'or');
        assert.equal(result['system.-=ebbHpWoundMode'], null);
    });

    test('migrates legacy ebbHpWoundMode "and" → ebbHealWoundMode "and"', () => {
        const result = getEbbFormulaMigrationUpdate({ system: { ebbHpWoundMode: 'and' } });
        assert.equal(result['system.ebbHealWoundMode'], 'and');
    });

    test('any non-or value for ebbHpWoundMode defaults to "and"', () => {
        const result = getEbbFormulaMigrationUpdate({ system: { ebbHpWoundMode: 'something' } });
        assert.equal(result['system.ebbHealWoundMode'], 'and');
    });

    test('skips ebbHpWoundMode migration when ebbHealWoundMode already exists', () => {
        const result = getEbbFormulaMigrationUpdate({
            system: { ebbHpWoundMode: 'or', ebbHealWoundMode: 'and' }
        });
        assert.equal(result?.['system.ebbHealWoundMode'], undefined);
        assert.equal(result?.['system.-=ebbHpWoundMode'], undefined);
    });

    test('returns null when no migrations are needed', () => {
        assert.equal(getEbbFormulaMigrationUpdate({ system: {} }), null);
        assert.equal(getEbbFormulaMigrationUpdate({ system: { ebbEffect: 'damage', removeWounds: 3 } }), null);
    });

    test('combines all migrations in a single pass', () => {
        const result = getEbbFormulaMigrationUpdate({
            system: { removeWounds: true, ebbEffect: 'none', ebbHpWoundMode: 'or' }
        });
        assert.equal(result['system.removeWounds'], 6);
        assert.equal(result['system.ebbEffect'], 'effect');
        assert.equal(result['system.ebbHealWoundMode'], 'or');
        assert.equal(result['system.-=ebbHpWoundMode'], null);
    });
});

// ─── getVehicleActorMigrationData ─────────────────────────────────────────────

describe('getVehicleActorMigrationData', () => {
    test('fills every field when system is completely empty', () => {
        const result = getVehicleActorMigrationData({ system: {} });
        assert.equal(result['system.notes'], '');
        assert.equal(result['system.skill'], '');
        assert.deepEqual(result['system.dimensions'], { length: '', width: '', height: '' });
        assert.equal(result['system.capacity'], '');
        assert.equal(result['system.mountedWeaponsIgnoreSkillReq'], true);
        assert.equal(result['system.providesCombatCover'], true);
        assert.deepEqual(result['system.hp'], { value: 10, max: 10 });
        assert.deepEqual(result['system.armor'], { pv: 0, resist: { value: 0, max: 0 } });
        assert.deepEqual(result['system.move'], { value: 0 });
    });

    test('skips top-level fields that are already present', () => {
        const result = getVehicleActorMigrationData({
            system: {
                notes: 'Armoured transport',
                skill: 'drive',
                capacity: '6',
                mountedWeaponsIgnoreSkillReq: false,
                providesCombatCover: false
            }
        });
        assert.equal(result['system.notes'], undefined);
        assert.equal(result['system.skill'], undefined);
        assert.equal(result['system.capacity'], undefined);
        assert.equal(result['system.mountedWeaponsIgnoreSkillReq'], undefined);
        assert.equal(result['system.providesCombatCover'], undefined);
    });

    test('fills only missing sub-fields within dimensions', () => {
        const result = getVehicleActorMigrationData({
            system: { dimensions: { length: '5m', width: undefined, height: '2m' } }
        });
        assert.equal(result['system.dimensions.length'], undefined);
        assert.equal(result['system.dimensions.width'], '');
        assert.equal(result['system.dimensions.height'], undefined);
    });

    test('fills only missing hp sub-fields', () => {
        const result = getVehicleActorMigrationData({ system: { hp: { value: 15 } } });
        assert.equal(result['system.hp'], undefined);
        assert.equal(result['system.hp.value'], undefined);
        assert.equal(result['system.hp.max'], 10);
    });

    test('fills only missing armor sub-fields', () => {
        const result = getVehicleActorMigrationData({ system: { armor: { pv: 3, resist: { value: 2 } } } });
        assert.equal(result['system.armor'], undefined);
        assert.equal(result['system.armor.pv'], undefined);
        assert.equal(result['system.armor.resist'], undefined);
        assert.equal(result['system.armor.resist.value'], undefined);
        assert.equal(result['system.armor.resist.max'], 0);
    });

    test('fills move.value when move exists but value is missing', () => {
        const result = getVehicleActorMigrationData({ system: { move: {} } });
        assert.equal(result['system.move'], undefined);
        assert.equal(result['system.move.value'], 0);
    });

    test('skips move when move.value is already set', () => {
        const result = getVehicleActorMigrationData({ system: { move: { value: 5 } } });
        assert.equal(result['system.move'], undefined);
        assert.equal(result['system.move.value'], undefined);
    });
});

// ─── getArmorMigrationData ────────────────────────────────────────────────────

describe('getArmorMigrationData', () => {
    test('returns null when all migration fields are already present', () => {
        const item = {
            id: 'armor1',
            system: {
                powered: false,
                mods: { str: 0, dex: 0, move: { closing: 0, rushing: 0 } },
                powersuit: false,
                dexCap: 0,
                initBonus: 0
            }
        };
        assert.equal(getArmorMigrationData(item), null);
    });

    test('fills all fields when system is bare', () => {
        const result = getArmorMigrationData({ id: 'a1', system: {} });
        assert.equal(result._id, 'a1');
        assert.equal(result['system.powered'], false);
        assert.equal(result['system.powersuit'], false);
        assert.equal(result['system.dexCap'], 0);
        assert.equal(result['system.initBonus'], 0);
        assert.ok(result['system.mods'], 'mods should be set');
    });

    test('only fills absent fields, does not overwrite present ones', () => {
        const result = getArmorMigrationData({
            id: 'a2',
            system: { powered: true, mods: { str: 2 }, powersuit: true }
        });
        assert.equal(result?.['system.powered'], undefined);
        assert.equal(result?.['system.mods'], undefined);
        assert.equal(result?.['system.powersuit'], undefined);
        assert.equal(result['system.dexCap'], 0);
        assert.equal(result['system.initBonus'], 0);
    });
});

// ─── getWeaponMigrationData ───────────────────────────────────────────────────

describe('getWeaponMigrationData', () => {
    const MELEE_SKILLS = ['melee', 'unarmed', 'thrown'];

    test('infers melee attack type from melee skill (case-insensitive)', () => {
        for (const skill of ['Melee', 'MELEE', 'melee']) {
            const result = getWeaponMigrationData({ id: 'w', system: { skill } }, MELEE_SKILLS);
            assert.equal(result['system.attackType'], 'melee', `Failed for skill="${skill}"`);
        }
    });

    test('infers melee for unarmed and thrown skills', () => {
        for (const skill of ['unarmed', 'thrown']) {
            const result = getWeaponMigrationData({ id: 'w', system: { skill } }, MELEE_SKILLS);
            assert.equal(result['system.attackType'], 'melee');
        }
    });

    test('infers ranged for non-melee skills', () => {
        for (const skill of ['Pistol', 'Rifle', 'Support Weapons', '']) {
            const result = getWeaponMigrationData({ id: 'w', system: { skill } }, MELEE_SKILLS);
            assert.equal(result['system.attackType'], 'ranged', `Failed for skill="${skill}"`);
        }
    });

    test('does not overwrite an already-set attackType', () => {
        const result = getWeaponMigrationData(
            { id: 'w', system: { attackType: 'melee', skill: 'Pistol', powersuitAttack: false, attackPenalty: 0, adFromStrMinus: 0 } },
            MELEE_SKILLS
        );
        // attackType already set to melee — no update needed for that field
        assert.equal(result?.['system.attackType'], undefined);
    });

    test('builds default firing modes for ranged weapon with no existing modes', () => {
        const result = getWeaponMigrationData({ id: 'w', system: { skill: 'Rifle', recoil: 2 } }, MELEE_SKILLS);
        const modes = result['system.firingModes'];
        assert.ok(modes?.single, 'single mode missing');
        assert.ok(modes?.burst, 'burst mode missing');
        assert.ok(modes?.auto, 'auto mode missing');
        assert.equal(modes.single.recoil, 0);
        assert.equal(modes.burst.recoil, 2);
        assert.equal(modes.auto.recoil, 4); // 2 × 2
    });

    test('uses fallback recoil of 1 / 4 when original recoil is 0', () => {
        const result = getWeaponMigrationData({ id: 'w', system: { skill: 'Pistol', recoil: 0 } }, MELEE_SKILLS);
        const modes = result['system.firingModes'];
        assert.equal(modes.burst.recoil, 1);
        assert.equal(modes.auto.recoil, 4);
    });

    test('does not build firing modes for melee weapons', () => {
        const result = getWeaponMigrationData(
            { id: 'w', system: { skill: 'melee', powersuitAttack: false, attackPenalty: 0, adFromStrMinus: 0 } },
            MELEE_SKILLS
        );
        assert.equal(result?.['system.firingModes'], undefined);
    });

    test('fills missing powersuitAttack, attackPenalty, adFromStrMinus', () => {
        const result = getWeaponMigrationData({ id: 'w', system: { attackType: 'melee' } }, MELEE_SKILLS);
        assert.equal(result['system.powersuitAttack'], false);
        assert.equal(result['system.attackPenalty'], 0);
        assert.equal(result['system.adFromStrMinus'], 0);
    });

    test('returns null when weapon is already fully migrated', () => {
        const firingModes = {
            single: { label: 'Single', active: true, rounds: 1, recoil: 0 },
            burst: { label: 'Burst', active: false, rounds: 3, recoil: 1 },
            auto: { label: 'Full Auto', active: false, rounds: 10, recoil: 4 }
        };
        const item = {
            id: 'w',
            system: { attackType: 'ranged', firingModes, powersuitAttack: false, attackPenalty: 0, adFromStrMinus: 0 }
        };
        assert.equal(getWeaponMigrationData(item, MELEE_SKILLS), null);
    });
});

// ─── getSpeciesMigrationData ──────────────────────────────────────────────────
// Spec from DEVELOPER.md and EBB_SYSTEM.md — each species has defined
// luck/flux pools, hp base, and movement values.

describe('getSpeciesMigrationData', () => {
    function species(name, systemOverrides = {}) {
        return { id: 's1', name, system: { luck: {}, flux: {}, move: {}, ...systemOverrides } };
    }

    test('Human: luck 1/6, hp 14, move 2/5', () => {
        const r = getSpeciesMigrationData(species('Human'));
        assert.equal(r['system.luck.initial'], 1);
        assert.equal(r['system.luck.max'], 6);
        assert.equal(r['system.hp'], 14);
        assert.equal(r['system.move.closing'], 2);
        assert.equal(r['system.move.rushing'], 5);
        // Human has no flux pool — flux is already 0/0 so it won't appear in the update payload
        assert.equal(r?.['system.flux.max'], undefined);
    });

    test('Ebon: flux 2/6, hp 14, move 2/5, no luck', () => {
        const r = getSpeciesMigrationData(species('Ebon'));
        assert.equal(r['system.flux.initial'], 2);
        assert.equal(r['system.flux.max'], 6);
        assert.equal(r['system.hp'], 14);
        assert.equal(r['system.move.closing'], 2);
        // Ebon has no luck pool — luck is already 0/0 so it won't appear in the update payload
        assert.equal(r?.['system.luck.max'], undefined);
    });

    test('Frother: luck 1/3, hp 15, move 2/5', () => {
        const r = getSpeciesMigrationData(species('Frother'));
        assert.equal(r['system.luck.initial'], 1);
        assert.equal(r['system.luck.max'], 3);
        assert.equal(r['system.hp'], 15);
    });

    test('Wraithen: luck 1/4, hp 14, move 4/8', () => {
        const r = getSpeciesMigrationData(species('Wraithen'));
        assert.equal(r['system.luck.initial'], 1);
        assert.equal(r['system.luck.max'], 4);
        assert.equal(r['system.hp'], 14);
        assert.equal(r['system.move.closing'], 4);
        assert.equal(r['system.move.rushing'], 8);
    });

    test('Shaktar: luck 0/3, hp 19, move 3/6', () => {
        const r = getSpeciesMigrationData(species('Shaktar'));
        assert.equal(r['system.luck.initial'], 0);
        assert.equal(r['system.luck.max'], 3);
        assert.equal(r['system.hp'], 19);
        assert.equal(r['system.move.closing'], 3);
        assert.equal(r['system.move.rushing'], 6);
    });

    test('Advanced Carrien: luck 0/3, hp 20, move 4/7', () => {
        const r = getSpeciesMigrationData(species('Advanced Carrien'));
        assert.equal(r['system.luck.max'], 3);
        assert.equal(r['system.hp'], 20);
        assert.equal(r['system.move.closing'], 4);
        assert.equal(r['system.move.rushing'], 7);
    });

    test('Neophron: luck 0/3, hp 11, move 2/5', () => {
        const r = getSpeciesMigrationData(species('Neophron'));
        assert.equal(r['system.luck.max'], 3);
        assert.equal(r['system.hp'], 11);
        assert.equal(r['system.move.closing'], 2);
    });

    test('Stormer 313 (Malice): luck 0/2, hp 22, move 3/6', () => {
        const r = getSpeciesMigrationData(species('Stormer 313 Malice'));
        assert.equal(r['system.luck.max'], 2);
        assert.equal(r['system.hp'], 22);
        assert.equal(r['system.move.closing'], 3);
        assert.equal(r['system.move.rushing'], 6);
    });

    test('Stormer 711 (Xeno): luck 0/2, hp 20, move 4/6', () => {
        const r = getSpeciesMigrationData(species('Stormer 711 Xeno'));
        assert.equal(r['system.luck.max'], 2);
        assert.equal(r['system.hp'], 20);
        assert.equal(r['system.move.closing'], 4);
        assert.equal(r['system.move.rushing'], 6);
    });

    test('generic Stormer: luck 0/2, hp 20, move 3/6', () => {
        const r = getSpeciesMigrationData(species('Stormer'));
        assert.equal(r['system.luck.max'], 2);
        assert.equal(r['system.hp'], 20);
        assert.equal(r['system.move.closing'], 3);
    });

    test('species name match is case-insensitive', () => {
        const r = getSpeciesMigrationData(species('HUMAN OPERATIVE'));
        assert.equal(r['system.luck.max'], 6);
    });

    test('returns null when species stats already match spec', () => {
        const result = getSpeciesMigrationData({
            id: 's2',
            name: 'Human',
            system: {
                luck: { initial: 1, max: 6 },
                flux: { initial: 0, max: 0 },
                hp: 14,
                move: { closing: 2, rushing: 5 }
            }
        });
        assert.equal(result, null);
    });

    test('updates only changed fields when partially migrated', () => {
        const result = getSpeciesMigrationData({
            id: 's3',
            name: 'Shaktar',
            system: {
                luck: { initial: 0, max: 3 },
                flux: { initial: 0, max: 0 },
                hp: 10, // wrong — should be 19
                move: { closing: 3, rushing: 6 }
            }
        });
        assert.ok(result !== null);
        assert.equal(result['system.hp'], 19);
        assert.equal(result['system.luck.initial'], undefined); // already correct
    });
});
