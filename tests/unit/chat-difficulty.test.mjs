/**
 * Unit tests for GM difficulty (TN) recalculation helpers used by onChangeDifficulty.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateRollResult, generateDiceTooltip } from '../../module/helpers/dice.mjs';
import { buildDifficultyNotes, rebuildDifficultyDamageFormula } from '../../module/helpers/chat/pure.mjs';

/** Minimal roll shape matching createSLARoll output after evaluate. */
function mockSkillRoll({ sdRaw = 8, skillRaw = [6, 9] } = {}) {
    return {
        terms: [{ results: [{ result: sdRaw }] }, { results: [] }, { results: skillRaw.map((result) => ({ result })) }],
        autoSkillSuccesses: 0
    };
}

describe('skill roll TN adjustment', () => {
    test('recalculates success against new TN', () => {
        const roll = mockSkillRoll({ sdRaw: 8 });
        const baseModifier = 2;
        const at10 = calculateRollResult(roll, baseModifier, 10);
        const at13 = calculateRollResult(roll, baseModifier, 13);
        assert.equal(at10.isSuccess, true);
        assert.equal(at10.total, 10);
        assert.equal(at13.isSuccess, false);
        assert.equal(at13.total, 10);
    });

    test('builds difficulty notes from flags TN', () => {
        const notes = buildDifficultyNotes('Perception', 10, 7);
        assert.equal(notes, 'Perception (TN 10 → 7)');
    });

    test('regenerates tooltip HTML for updated card content', () => {
        const roll = mockSkillRoll({ sdRaw: 8, skillRaw: [6, 9] });
        const html = generateDiceTooltip(roll, 2);
        assert.match(html, /Success Die/);
        assert.match(html, /dice-tooltip/);
        assert.match(html, /<strong>10<\/strong>/);
    });

    test('rebuilds damage formula when MOS bonus changes with TN', () => {
        const formula = rebuildDifficultyDamageFormula('2d10', 1, 2);
        assert.equal(formula, '2d10 + 3');
    });
});
