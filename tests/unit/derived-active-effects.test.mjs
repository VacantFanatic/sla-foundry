/**
 * Unit tests for active effect ADD mode resolution (no Foundry runtime).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
    effectChangeRows,
    resolveActiveEffectAddModes,
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

describe('resolveActiveEffectAddModes', () => {
    test('includes v14 lowercase add and legacy ADD modes', () => {
        const modes = resolveActiveEffectAddModes({
            ACTIVE_EFFECT_CHANGE_TYPES: { add: 20 },
            ACTIVE_EFFECT_MODES: { ADD: 2 }
        });
        assert.equal(modes.has(20), true);
        assert.equal(modes.has(2), true);
    });

    test('falls back to legacy mode 2 when CONST is missing', () => {
        const modes = resolveActiveEffectAddModes(undefined);
        assert.equal(modes.has(2), true);
    });
});

describe('sumActiveEffectAddsForStat', () => {
    const addModes = new Set([2, 20]);

    test('sums bonus key rows with legacy ADD mode 2', () => {
        const sum = sumActiveEffectAddsForStat(
            [
                {
                    disabled: false,
                    changes: [{ key: 'system.stats.str.bonus', mode: 2, value: 3 }]
                }
            ],
            'str',
            addModes
        );
        assert.equal(sum, 3);
    });

    test('sums bonus key rows with v14 ADD mode 20', () => {
        const sum = sumActiveEffectAddsForStat(
            [
                {
                    disabled: false,
                    changes: [{ key: 'system.stats.str.bonus', mode: 20, value: 4 }]
                }
            ],
            'str',
            addModes
        );
        assert.equal(sum, 4);
    });

    test('sums legacy value key rows', () => {
        const sum = sumActiveEffectAddsForStat(
            [
                {
                    disabled: false,
                    changes: [{ key: 'system.stats.dex.value', mode: 2, value: 1 }]
                }
            ],
            'dex',
            addModes
        );
        assert.equal(sum, 1);
    });

    test('ignores disabled effects and non-ADD modes', () => {
        const sum = sumActiveEffectAddsForStat(
            [
                {
                    disabled: true,
                    changes: [{ key: 'system.stats.str.bonus', mode: 2, value: 9 }]
                },
                {
                    disabled: false,
                    changes: [{ key: 'system.stats.str.bonus', mode: 50, value: 9 }]
                },
                {
                    disabled: false,
                    changes: [{ key: 'system.stats.conc.bonus', mode: 20, value: 2 }]
                }
            ],
            'str',
            addModes
        );
        assert.equal(sum, 0);
    });

    test('sums multiple enabled ADD rows', () => {
        const sum = sumActiveEffectAddsForStat(
            [
                {
                    disabled: false,
                    changes: [
                        { key: 'system.stats.cool.bonus', mode: 2, value: 1 },
                        { key: 'system.stats.cool.bonus', mode: 20, value: 2 }
                    ]
                }
            ],
            'cool',
            addModes
        );
        assert.equal(sum, 3);
    });
});
