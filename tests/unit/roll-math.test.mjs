/**
 * Unit tests for actor sheet roll math helpers (no Foundry runtime).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildSkillRollFormula,
    computeSkillRollModifier,
    buildWeaponDamageFormula,
    resolveWeaponMosOutcome
} from '../../module/sheets/actor/roll-math.mjs';

describe('buildSkillRollFormula', () => {
    test('rank 0 rolls one skill die', () => {
        assert.equal(buildSkillRollFormula(0), '1d10 + 1d10');
    });

    test('rank 2 rolls three skill dice', () => {
        assert.equal(buildSkillRollFormula(2), '1d10 + 3d10');
    });
});

describe('computeSkillRollModifier', () => {
    test('sums stat, rank, and global modifiers', () => {
        const mod = computeSkillRollModifier({
            statValue: 3,
            rank: 2,
            prone: false,
            stunned: false,
            woundPenalty: 0,
            applyWoundPenalties: true
        });
        assert.equal(mod, 5);
    });

    test('applies prone and stunned penalties', () => {
        const mod = computeSkillRollModifier({
            statValue: 3,
            rank: 1,
            prone: true,
            stunned: true,
            woundPenalty: 0,
            applyWoundPenalties: true
        });
        assert.equal(mod, 2);
    });

    test('subtracts wound penalty when enabled', () => {
        const mod = computeSkillRollModifier({
            statValue: 4,
            rank: 1,
            prone: false,
            stunned: false,
            woundPenalty: 2,
            applyWoundPenalties: true
        });
        assert.equal(mod, 3);
    });
});

describe('buildWeaponDamageFormula', () => {
    test('appends positive modifier to base damage', () => {
        assert.equal(buildWeaponDamageFormula('2d10', 3), '2d10 + 3');
    });

    test('returns modifier alone when base is zero', () => {
        assert.equal(buildWeaponDamageFormula('0', 2), '2');
    });
});

describe('resolveWeaponMosOutcome', () => {
    test('MOS 2 offers arm wound choice', () => {
        const mos = resolveWeaponMosOutcome({
            isSuccess: true,
            successThroughExperience: false,
            skillSuccessCount: 2
        });
        assert.equal(mos.mosChoiceData.hasChoice, true);
        assert.equal(mos.mosChoiceData.choiceType, 'arm');
    });

    test('MOS 4+ is head shot with +6 damage', () => {
        const mos = resolveWeaponMosOutcome({
            isSuccess: true,
            successThroughExperience: false,
            skillSuccessCount: 4
        });
        assert.equal(mos.mosDamageBonus, 6);
        assert.equal(mos.shouldApplyHeadWound, true);
    });
});
