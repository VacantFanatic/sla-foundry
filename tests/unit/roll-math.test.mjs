/**
 * Unit tests for actor sheet roll math helpers (no Foundry runtime).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
    applyExplosiveRollAdjustments,
    applySuccessThroughExperience,
    buildEbbDamageFormula,
    buildExplosiveMods,
    buildSkillDiceResults,
    buildSkillRollFormula,
    calculateEbbModifier,
    computeExplosiveMaxRange,
    computeMeleeStrDamageModifier,
    computeSkillRollModifier,
    computeSuccessDieOutcome,
    isStatCheckSuccess,
    computeWeaponSkillDiceCount,
    buildWeaponDamageFormula,
    resolveEbbDisciplineName,
    resolveEbbOutcomeText,
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

describe('isStatCheckSuccess', () => {
    test('requires total above TN for stat checks', () => {
        assert.equal(isStatCheckSuccess(10), false);
        assert.equal(isStatCheckSuccess(11), true);
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

describe('computeExplosiveMaxRange', () => {
    test('scales throw range with STR up to 5', () => {
        assert.equal(computeExplosiveMaxRange(0), 15);
        assert.equal(computeExplosiveMaxRange(3), 30);
        assert.equal(computeExplosiveMaxRange(5), 40);
        assert.equal(computeExplosiveMaxRange(9), 40);
    });
});

describe('buildExplosiveMods', () => {
    test('maps form modifier to allDice', () => {
        const mods = buildExplosiveMods({ mod: 2 });
        assert.equal(mods.allDice, 2);
        assert.equal(mods.successDie, 0);
    });
});

describe('applyExplosiveRollAdjustments', () => {
    test('applies prone, wounds, cover, and aiming', () => {
        const mods = buildExplosiveMods({ mod: 1 });
        applyExplosiveRollAdjustments({
            prone: true,
            stunned: false,
            woundPenalty: 2,
            applyWoundPenalties: true,
            rollData: { cover: 1, aiming: 'sd' },
            mods
        });
        assert.equal(mods.allDice, -2);
        assert.equal(mods.successDie, 2);
    });

    test('skill aiming grants auto skill success', () => {
        const mods = buildExplosiveMods({ mod: 0 });
        applyExplosiveRollAdjustments({
            prone: false,
            stunned: false,
            woundPenalty: 0,
            applyWoundPenalties: false,
            rollData: { cover: 0, aiming: 'skill' },
            mods
        });
        assert.equal(mods.autoSkillSuccesses, 1);
    });
});

describe('resolveEbbDisciplineName', () => {
    test('resolves discipline key to display label', () => {
        const name = resolveEbbDisciplineName('blast', { blast: 'Blast Discipline', heal: 'Heal' });
        assert.equal(name, 'Blast Discipline');
    });

    test('returns input when no mapping matches', () => {
        assert.equal(resolveEbbDisciplineName('Unknown', {}), 'Unknown');
    });
});

describe('calculateEbbModifier', () => {
    test('uses CONC and rank with global penalties', () => {
        const mod = calculateEbbModifier({
            statValue: 4,
            rank: 2,
            prone: true,
            stunned: false,
            woundPenalty: 1,
            applyWoundPenalties: true
        });
        assert.equal(mod, 4);
    });
});

describe('resolveEbbOutcomeText', () => {
    test('MOS 4 damage attack is critical with flux regain text', () => {
        const r = resolveEbbOutcomeText(true, 4, 'damage');
        assert.equal(r.isSuccessful, true);
        assert.match(r.mosEffectText, /CRITICAL/);
        assert.match(r.mosEffectText, /\+4 Dmg/);
    });

    test('all dice failed is severe failure', () => {
        const r = resolveEbbOutcomeText(false, 0, 'effect');
        assert.equal(r.isSuccessful, false);
        assert.match(r.failureConsequence, /SEVERE FAILURE/);
    });
});

describe('buildEbbDamageFormula', () => {
    test('adds MOS bonus for successful damage formula', () => {
        const item = {
            system: {
                dmg: '2d10',
                ebbEffect: 'damage',
                removeWounds: 0
            }
        };
        const r = buildEbbDamageFormula(item, true, 2);
        assert.equal(r.finalDmgFormula, '2d10 + 1');
        assert.equal(r.showHpRollButton, true);
        assert.equal(r.ebbEffect, 'damage');
    });

    test('effect-only heal wounds shows remove wounds without HP roll', () => {
        const item = {
            system: {
                dmg: '0',
                ebbEffect: 'effect',
                removeWounds: 2
            }
        };
        const r = buildEbbDamageFormula(item, true, 1);
        assert.equal(r.showRemoveWoundsOnly, true);
        assert.equal(r.showHpRollButton, false);
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
