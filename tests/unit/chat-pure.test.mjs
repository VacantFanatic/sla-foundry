/**
 * Unit tests for chat pure helpers (no Foundry runtime).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildDifficultyNotes,
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
