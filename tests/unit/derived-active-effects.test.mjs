/**
 * Unit tests for active effect ADD mode resolution (no Foundry runtime).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
    effectChangeRows,
    resolveActiveEffectAddMatcher,
    isActiveEffectAddChange,
    sumActiveEffectAddsForStat
} from '../../module/documents/derived/active-effects.mjs';

describe('effectChangeRows', () => {
    test('prefers top-level changes array', () => {
        const rows = [{ key: 'system.stats.str.bonus', mode: 2, value: 1 }];
        assert.deepEqual(effectChangeRows({ changes: rows, system: { changes: [] } }), rows);
    });

    test('falls back to system.changes when root is empty', () => {
        const rows = [{ key: 'system.stats.dex.bonus', mode: 20, value: 2 }];
        assert.deepEqual(effectChangeRows({ changes: [], system: { changes: rows } }), rows);
    });
});

describe('resolveActiveEffectAddMatcher', () => {
    test('reads the canonical v14 string ADD type and legacy numeric ADD mode', () => {
        const matcher = resolveActiveEffectAddMatcher({
            ACTIVE_EFFECT_CHANGE_TYPES: { ADD: 'add', MULTIPLY: 'multiply' },
            ACTIVE_EFFECT_MODES: { ADD: 2 }
        });
        assert.equal(matcher.addType, 'add');
        assert.equal(matcher.legacyAddModes.has(2), true);
    });

    test('falls back to "add"/mode 2 when CONST is missing', () => {
        const matcher = resolveActiveEffectAddMatcher(undefined);
        assert.equal(matcher.addType, 'add');
        assert.equal(matcher.legacyAddModes.has(2), true);
    });
});

describe('isActiveEffectAddChange', () => {
    const matcher = resolveActiveEffectAddMatcher({
        ACTIVE_EFFECT_CHANGE_TYPES: { ADD: 'add' },
        ACTIVE_EFFECT_MODES: { ADD: 2 }
    });

    test('matches a genuine v14.367-authored change row (type: "add", no mode field)', () => {
        const change = { key: 'system.stats.str.bonus', type: 'add', value: 1 };
        assert.equal(isActiveEffectAddChange(change, matcher), true);
    });

    test('rejects a non-ADD string type even if a stale numeric mode is also present', () => {
        const change = { key: 'system.stats.str.bonus', type: 'multiply', mode: 2, value: 1 };
        assert.equal(isActiveEffectAddChange(change, matcher), false);
    });

    test('falls back to legacy numeric mode when type is absent (pre-v14 world data)', () => {
        const change = { key: 'system.stats.str.bonus', mode: 2, value: 3 };
        assert.equal(isActiveEffectAddChange(change, matcher), true);
    });

    test('rejects a non-ADD legacy mode when type is absent', () => {
        const change = { key: 'system.stats.str.bonus', mode: 0, value: 3 };
        assert.equal(isActiveEffectAddChange(change, matcher), false);
    });
});

describe('sumActiveEffectAddsForStat', () => {
    const addMatcher = resolveActiveEffectAddMatcher({
        ACTIVE_EFFECT_CHANGE_TYPES: { ADD: 'add' },
        ACTIVE_EFFECT_MODES: { ADD: 2 }
    });

    test('sums a real v14 ActiveEffectConfig-authored change row (type: "add", no mode field at all)', () => {
        const sum = sumActiveEffectAddsForStat(
            [
                {
                    disabled: false,
                    changes: [{ key: 'system.stats.str.bonus', type: 'add', value: 1 }]
                }
            ],
            'str',
            addMatcher
        );
        assert.equal(sum, 1);
    });

    test('regression: toggling that same effect disabled removes the bonus (issue #330 repro)', () => {
        const effect = {
            disabled: true,
            changes: [{ key: 'system.stats.str.bonus', type: 'add', value: 1 }]
        };
        assert.equal(sumActiveEffectAddsForStat([effect], 'str', addMatcher), 0);
        assert.equal(sumActiveEffectAddsForStat([{ ...effect, disabled: false }], 'str', addMatcher), 1);
    });

    test('sums bonus key rows with legacy numeric ADD mode (old-world data, no type field)', () => {
        const sum = sumActiveEffectAddsForStat(
            [{ disabled: false, changes: [{ key: 'system.stats.str.bonus', mode: 2, value: 3 }] }],
            'str',
            addMatcher
        );
        assert.equal(sum, 3);
    });

    test('sums legacy value key rows', () => {
        const sum = sumActiveEffectAddsForStat(
            [{ disabled: false, changes: [{ key: 'system.stats.dex.value', mode: 2, value: 1 }] }],
            'dex',
            addMatcher
        );
        assert.equal(sum, 1);
    });

    test('ignores disabled effects and non-ADD changes (string type or numeric mode)', () => {
        const sum = sumActiveEffectAddsForStat(
            [
                { disabled: true, changes: [{ key: 'system.stats.str.bonus', type: 'add', value: 9 }] },
                { disabled: false, changes: [{ key: 'system.stats.str.bonus', type: 'multiply', value: 9 }] },
                { disabled: false, changes: [{ key: 'system.stats.str.bonus', mode: 5, value: 9 }] },
                { disabled: false, changes: [{ key: 'system.stats.conc.bonus', type: 'add', value: 2 }] }
            ],
            'str',
            addMatcher
        );
        assert.equal(sum, 0);
    });

    test('sums multiple enabled ADD rows mixing v14 string type and legacy numeric mode on the same stat', () => {
        const sum = sumActiveEffectAddsForStat(
            [
                { disabled: false, changes: [{ key: 'system.stats.cool.bonus', mode: 2, value: 1 }] },
                { disabled: false, changes: [{ key: 'system.stats.cool.bonus', type: 'add', value: 2 }] }
            ],
            'cool',
            addMatcher
        );
        assert.equal(sum, 3);
    });
});
