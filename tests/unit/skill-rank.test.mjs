/**
 * Unit regression tests for skill rank arithmetic (no Foundry runtime).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { incrementSkillRank, normalizeEbbEffect, normalizeEbbHealWoundMode } from '../../module/helpers/items.mjs';

describe('incrementSkillRank', () => {
    test('increments string ranks numerically (not concatenation)', () => {
        assert.equal(incrementSkillRank('1'), '2');
        assert.equal(incrementSkillRank('10'), '11');
    });

    test('handles missing or invalid ranks as zero', () => {
        assert.equal(incrementSkillRank(undefined), '1');
        assert.equal(incrementSkillRank(null), '1');
        assert.equal(incrementSkillRank(''), '1');
        assert.equal(incrementSkillRank('abc'), '1');
    });

    test('accepts numeric input', () => {
        assert.equal(incrementSkillRank(2), '3');
    });
});

describe('normalizeEbbEffect', () => {
    test('defaults missing/falsy values to "damage"', () => {
        assert.equal(normalizeEbbEffect(undefined), 'damage');
        assert.equal(normalizeEbbEffect(null), 'damage');
        assert.equal(normalizeEbbEffect(''), 'damage');
    });

    test('remaps legacy "none" to "effect"', () => {
        assert.equal(normalizeEbbEffect('none'), 'effect');
    });

    test('passes through any other explicit value unchanged', () => {
        assert.equal(normalizeEbbEffect('heal'), 'heal');
        assert.equal(normalizeEbbEffect('effect'), 'effect');
    });
});

describe('normalizeEbbHealWoundMode', () => {
    test('defaults missing/nullish values to "and"', () => {
        assert.equal(normalizeEbbHealWoundMode(undefined), 'and');
        assert.equal(normalizeEbbHealWoundMode(null), 'and');
    });

    test('recognizes "or" case-insensitively', () => {
        assert.equal(normalizeEbbHealWoundMode('or'), 'or');
        assert.equal(normalizeEbbHealWoundMode('OR'), 'or');
    });

    test('any other value falls back to "and"', () => {
        assert.equal(normalizeEbbHealWoundMode('and'), 'and');
        assert.equal(normalizeEbbHealWoundMode('bogus'), 'and');
    });
});
