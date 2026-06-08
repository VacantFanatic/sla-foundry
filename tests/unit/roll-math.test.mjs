/**
 * Unit tests for actor sheet roll math helpers (no Foundry runtime).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
    applySuccessThroughExperience,
    buildSkillDiceResults,
    buildSkillRollFormula,
    computeMeleeStrDamageModifier,
    computeSkillRollModifier,
    computeSuccessDieOutcome,
    computeWeaponSkillDiceCount,
    buildWeaponDamageFormula,
    resolveExplosiveBlastData,
    resolveWeaponMosOutcome
} from '../../module/sheets/actor/roll-math.mjs';

function mockWeaponRoll(successDieRaw, skillDieRaws = []) {
    return {
        terms: [{ results: [{ result: successDieRaw }] }, {}, { results: skillDieRaws.map((r) => ({ result: r })) }]
    };
}

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

describe('computeMeleeStrDamageModifier', () => {
    test('scales STR bonus for melee damage', () => {
        assert.equal(computeMeleeStrDamageModifier(5), 1);
        assert.equal(computeMeleeStrDamageModifier(6), 2);
        assert.equal(computeMeleeStrDamageModifier(7), 4);
        assert.equal(computeMeleeStrDamageModifier(3), 0);
    });
});

describe('computeSuccessDieOutcome', () => {
    test('success when modified total meets TN', () => {
        const r = computeSuccessDieOutcome({ sdRaw: 6, baseModifier: 4, successDieModifier: 0, targetNumber: 10 });
        assert.equal(r.isBaseSuccess, true);
        assert.equal(r.sdTotal, 10);
    });
});

describe('applySuccessThroughExperience', () => {
    test('converts failed SD with 4+ skill hits to success', () => {
        const r = applySuccessThroughExperience({ isBaseSuccess: false, skillSuccessCount: 4 });
        assert.equal(r.isSuccess, true);
        assert.equal(r.successThroughExperience, true);
        assert.ok(r.note);
    });
});

describe('buildSkillDiceResults', () => {
    test('counts skill dice at or above TN', () => {
        const roll = mockWeaponRoll(3, [8, 4, 10]);
        const { skillSuccessCount, skillDiceData } = buildSkillDiceResults({
            roll,
            baseModifier: 0,
            targetNumber: 8
        });
        assert.equal(skillSuccessCount, 2);
        assert.equal(skillDiceData.length, 3);
    });
});

describe('computeWeaponSkillDiceCount', () => {
    test('subtracts reserved and aim-auto dice from pool', () => {
        assert.equal(computeWeaponSkillDiceCount(3, { reservedDice: 1, aimAuto: 1 }), 2);
    });
});

describe('resolveExplosiveBlastData', () => {
    test('defaults outer blast to 5 when unset', () => {
        const d = resolveExplosiveBlastData({ blastRadiusInner: 2, blastRadiusOuter: 0 });
        assert.equal(d.innerDist, 2);
        assert.equal(d.outerDist, 5);
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
