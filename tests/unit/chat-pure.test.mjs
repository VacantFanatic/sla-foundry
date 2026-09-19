/**
 * Unit tests for chat pure helpers (no Foundry runtime).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
    applyPvModifierToArmor,
    buildDifficultyNotes,
    buildUndoDamageUpdates,
    buildWoundClearUpdates,
    computeHealHpBounds,
    computeMitigatedDamage,
    rebuildDifficultyDamageFormula,
    resolveTacticalWoundOutcome
} from '../../module/helpers/chat/pure.mjs';

describe('buildWoundClearUpdates', () => {
    test('clears wounds in head-to-legs order up to count', () => {
        const wounds = { head: true, torso: false, lArm: true, rArm: false, lLeg: true, rLeg: false };
        const { updates, clearedCount } = buildWoundClearUpdates(wounds, 2);
        assert.equal(clearedCount, 2);
        assert.equal(updates['system.wounds.head'], false);
        assert.equal(updates['system.wounds.lArm'], false);
        assert.equal(updates['system.wounds.lLeg'], undefined);
    });

    test('returns empty when count is zero', () => {
        const r = buildWoundClearUpdates({ head: true }, 0);
        assert.equal(r.clearedCount, 0);
        assert.deepEqual(r.updates, {});
    });
});

describe('computeMitigatedDamage', () => {
    test('subtracts effective PV floored at zero', () => {
        assert.equal(computeMitigatedDamage(8, 3), 5);
        assert.equal(computeMitigatedDamage(2, 5), 0);
    });
});

describe('applyPvModifierToArmor', () => {
    test('AP rounds (-2) reduce the target armor PV', () => {
        assert.equal(applyPvModifierToArmor(6, -2), 4);
    });

    test('floors at zero instead of going negative', () => {
        assert.equal(applyPvModifierToArmor(1, -2), 0);
    });

    test('defaults to no change when pvMod is omitted', () => {
        assert.equal(applyPvModifierToArmor(6), 6);
    });

    test('non-AP ammo (0 mod) leaves PV untouched', () => {
        assert.equal(applyPvModifierToArmor(6, 0), 6);
    });
});

describe('computeHealHpBounds', () => {
    test('caps heal at max HP', () => {
        const r = computeHealHpBounds(8, 10, 5);
        assert.equal(r.newHP, 10);
        assert.equal(r.finalHeal, 2);
    });
});

describe('buildDifficultyNotes', () => {
    test('strips prior TN suffix and appends new TN note', () => {
        const notes = buildDifficultyNotes('Blast: 5m (TN 10 → 12)', 10, 8);
        assert.equal(notes, 'Blast: 5m (TN 10 → 8)');
    });

    test('uses single TN when unchanged from original', () => {
        const notes = buildDifficultyNotes('Blast: 5m', 10, 10);
        assert.equal(notes, 'Blast: 5m (TN 10)');
    });
});

describe('rebuildDifficultyDamageFormula', () => {
    test('combines damage mod and MOS bonus', () => {
        assert.equal(rebuildDifficultyDamageFormula('2d10', 1, 2), '2d10 + 3');
        assert.equal(rebuildDifficultyDamageFormula('0', 0, 4), '4');
    });
});

describe('buildUndoDamageUpdates', () => {
    test('reverts HP when current HP matches the recorded new value', () => {
        const { ok, actorUpdates, itemUpdates } = buildUndoDamageUpdates(
            { hp: { old: 10, new: 4 }, armor: null, wounds: null },
            { hpValue: 4, itemResistances: {}, wounds: {} }
        );
        assert.equal(ok, true);
        assert.equal(actorUpdates['system.hp.value'], 10);
        assert.deepEqual(itemUpdates, {});
    });

    test('aborts with hp-mismatch when HP has changed since apply', () => {
        const r = buildUndoDamageUpdates(
            { hp: { old: 10, new: 4 }, armor: null, wounds: null },
            { hpValue: 7, itemResistances: {}, wounds: {} }
        );
        assert.equal(r.ok, false);
        assert.equal(r.reason, 'hp-mismatch');
        assert.deepEqual(r.actorUpdates, {});
    });

    test('reverts one armor item resistance keyed by itemUuid', () => {
        const { ok, itemUpdates } = buildUndoDamageUpdates(
            { hp: null, armor: [{ itemUuid: 'Item.abc', resistance: { old: 10, new: 6 } }], wounds: null },
            { hpValue: 0, itemResistances: { 'Item.abc': 6 }, wounds: {} }
        );
        assert.equal(ok, true);
        assert.equal(itemUpdates['Item.abc']['system.resistance.value'], 10);
    });

    test('aborts with armor-item-missing when the item is gone', () => {
        const r = buildUndoDamageUpdates(
            { hp: null, armor: [{ itemUuid: 'Item.abc', resistance: { old: 10, new: 6 } }], wounds: null },
            { hpValue: 0, itemResistances: {}, wounds: {} }
        );
        assert.equal(r.ok, false);
        assert.equal(r.reason, 'armor-item-missing');
    });

    test('aborts with armor-mismatch when resistance changed since apply', () => {
        const r = buildUndoDamageUpdates(
            { hp: null, armor: [{ itemUuid: 'Item.abc', resistance: { old: 10, new: 6 } }], wounds: null },
            { hpValue: 0, itemResistances: { 'Item.abc': 3 }, wounds: {} }
        );
        assert.equal(r.ok, false);
        assert.equal(r.reason, 'armor-mismatch');
    });

    test('reverts cleared wound keys back to true', () => {
        const { ok, actorUpdates } = buildUndoDamageUpdates(
            { hp: null, armor: null, wounds: { cleared: ['head', 'lArm'] } },
            { hpValue: 0, itemResistances: {}, wounds: { head: false, lArm: false } }
        );
        assert.equal(ok, true);
        assert.equal(actorUpdates['system.wounds.head'], true);
        assert.equal(actorUpdates['system.wounds.lArm'], true);
    });

    test('aborts with wounds-mismatch when a wound was independently toggled back', () => {
        const r = buildUndoDamageUpdates(
            { hp: null, armor: null, wounds: { cleared: ['head'] } },
            { hpValue: 0, itemResistances: {}, wounds: { head: true } }
        );
        assert.equal(r.ok, false);
        assert.equal(r.reason, 'wounds-mismatch');
    });

    test('returns ok with empty updates when there is nothing to undo', () => {
        const r = buildUndoDamageUpdates(
            { hp: null, armor: null, wounds: null },
            { hpValue: 0, itemResistances: {}, wounds: {} }
        );
        assert.equal(r.ok, true);
        assert.deepEqual(r.actorUpdates, {});
        assert.deepEqual(r.itemUpdates, {});
    });
});

describe('resolveTacticalWoundOutcome', () => {
    test('applies left arm wound when available', () => {
        const r = resolveTacticalWoundOutcome({
            location: 'arm',
            wounds: { lArm: false, rArm: false, lLeg: false, rLeg: false },
            targetName: 'Target',
            baseFormula: '2d10',
            bonus: 2
        });
        assert.equal(r.woundSuccess, true);
        assert.equal(r.rollFormula, '2d10');
        assert.equal(r.woundUpdates['system.wounds.lArm'], true);
        assert.match(r.flavorText, /Left Arm/);
    });

    test('falls back to bonus damage when limbs are gone', () => {
        const r = resolveTacticalWoundOutcome({
            location: 'leg',
            wounds: { lArm: false, rArm: false, lLeg: true, rLeg: true },
            targetName: 'Target',
            baseFormula: '2d10',
            bonus: 4
        });
        assert.equal(r.woundSuccess, false);
        assert.equal(r.rollFormula, '2d10 + 4');
        assert.match(r.flavorText, /Limbs Gone/);
    });
});
