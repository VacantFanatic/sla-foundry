/**
 * Regression tests for SLA dice result helpers (no Foundry runtime).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateRollResult, generateDiceTooltip, getMOS } from '../../module/helpers/dice.mjs';

/** Minimal roll shape matching what calculateRollResult reads */
function mockRoll(successDieRaw, skillDieRaws = []) {
    const terms = [{ results: [{ result: successDieRaw }] }, {}];
    if (skillDieRaws.length) {
        terms.push({ results: skillDieRaws.map((r) => ({ result: r })) });
    }
    return { terms };
}

describe('calculateRollResult', () => {
    test('returns failure when roll has no terms', () => {
        const r = calculateRollResult({ terms: [] }, 0, 10);
        assert.equal(r.isSuccess, false);
        assert.equal(r.total, 0);
    });

    test('success when success die + base modifier meets TN', () => {
        const r = calculateRollResult(mockRoll(7, [5, 8]), 3, 10);
        assert.equal(r.total, 10);
        assert.equal(r.isSuccess, true);
    });

    test('counts skill dice hits vs TN', () => {
        const r = calculateRollResult(mockRoll(2, [9, 4]), 3, 10);
        assert.equal(r.isSuccess, false);
        assert.equal(r.skillHits, 1);
    });

    test('respects luckBonus on success die', () => {
        const r = calculateRollResult(mockRoll(4, []), 3, 10, { luckBonus: 4 });
        assert.equal(r.total, 11);
        assert.equal(r.isSuccess, true);
    });
});

describe('getMOS', () => {
    test('maps MOS 4+ to head shot damage bonus', () => {
        const result = {
            isSuccess: true,
            skillHits: 4,
            successThroughExperience: false
        };
        const mos = getMOS(result);
        assert.equal(mos.damageBonus, 6);
        assert.match(mos.effect, /HEAD/);
    });
});

describe('generateDiceTooltip', () => {
    test('renders exactly as before when no breakdown is passed (no regression for existing callers)', () => {
        const html = generateDiceTooltip(mockRoll(7), 3);
        assert.match(html, /Success Die:<\/strong> Raw 7 \+ Base 3 = <strong>10<\/strong>/);
        assert.doesNotMatch(html, /\(/);
    });

    test('renders each breakdown entry next to Base when provided', () => {
        const html = generateDiceTooltip(mockRoll(10), 3, 0, 0, [
            { label: 'STR', value: 5 },
            { label: 'Stunned', value: -1 },
            { label: 'Wound Penalty', value: -1 }
        ]);
        assert.match(html, /Base 3 <span[^>]*>\(STR \+5, Stunned -1, Wound Penalty -1\)<\/span>/);
        assert.match(html, /<strong>13<\/strong>/);
    });

    test('an empty breakdown array renders the same as omitting it', () => {
        const withEmpty = generateDiceTooltip(mockRoll(7), 3, 0, 0, []);
        const withOmitted = generateDiceTooltip(mockRoll(7), 3);
        assert.equal(withEmpty, withOmitted);
    });
});
