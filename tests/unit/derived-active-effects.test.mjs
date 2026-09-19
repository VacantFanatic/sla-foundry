/**
 * Unit tests for active effect change-type resolution and derived-field computation
 * (no Foundry runtime).
 *
 * Type-string values ('add', 'subtract', etc.) are used directly rather than read from
 * `CONST.ACTIVE_EFFECT_CHANGE_TYPES` — confirmed live against a running Foundry v14.367
 * instance that CONST's keys are lowercase and map to unrelated numbers
 * (`CONST.ACTIVE_EFFECT_CHANGE_TYPES.add === 20`, not `'add'`; there is no uppercase `.ADD`).
 * See the Lessons Learned entry for issue #359 before assuming otherwise.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
    effectChangeRows,
    resolveActiveEffectChangeType,
    applyActiveEffectChange,
    computeActiveEffectFieldValue,
    computeActiveEffectStatBonus,
    computeActiveEffectKeyValue
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

describe('resolveActiveEffectChangeType', () => {
    test('accepts each of the 7 canonical v14 string types', () => {
        for (const type of ['custom', 'multiply', 'add', 'subtract', 'downgrade', 'upgrade', 'override']) {
            assert.equal(resolveActiveEffectChangeType({ type, value: 1 }), type);
        }
    });

    test('rejects an unrecognized string type', () => {
        assert.equal(resolveActiveEffectChangeType({ type: 'not-a-real-type', value: 1 }), null);
    });

    test('falls back to legacy numeric mode when type is absent (pre-v14 world data)', () => {
        assert.equal(resolveActiveEffectChangeType({ mode: 0, value: 1 }), 'custom');
        assert.equal(resolveActiveEffectChangeType({ mode: 1, value: 1 }), 'multiply');
        assert.equal(resolveActiveEffectChangeType({ mode: 2, value: 1 }), 'add');
        assert.equal(resolveActiveEffectChangeType({ mode: 3, value: 1 }), 'downgrade');
        assert.equal(resolveActiveEffectChangeType({ mode: 4, value: 1 }), 'upgrade');
        assert.equal(resolveActiveEffectChangeType({ mode: 5, value: 1 }), 'override');
    });

    test('rejects an out-of-range legacy numeric mode', () => {
        assert.equal(resolveActiveEffectChangeType({ mode: 99, value: 1 }), null);
    });

    test('there is no legacy numeric mode that resolves to subtract', () => {
        const legacyResults = [0, 1, 2, 3, 4, 5].map((mode) => resolveActiveEffectChangeType({ mode, value: 1 }));
        assert.equal(legacyResults.includes('subtract'), false);
    });

    test('prefers string type over a stale numeric mode when both are present', () => {
        assert.equal(resolveActiveEffectChangeType({ type: 'multiply', mode: 2, value: 1 }), 'multiply');
    });

    test('returns null when neither type nor mode is present', () => {
        assert.equal(resolveActiveEffectChangeType({ value: 1 }), null);
    });
});

describe('applyActiveEffectChange', () => {
    test('add: current + value', () => {
        assert.equal(applyActiveEffectChange(3, 'add', 2), 5);
    });

    test('subtract: current - value', () => {
        assert.equal(applyActiveEffectChange(6, 'subtract', 2), 4);
    });

    test('multiply: current * value', () => {
        assert.equal(applyActiveEffectChange(4, 'multiply', 3), 12);
    });

    test('multiply against a zero base stays zero (documented, expected Foundry-consistent behavior)', () => {
        assert.equal(applyActiveEffectChange(0, 'multiply', 5), 0);
    });

    test('downgrade: keeps the lower value', () => {
        assert.equal(applyActiveEffectChange(2, 'downgrade', 0), 0);
        assert.equal(applyActiveEffectChange(2, 'downgrade', 3), 2);
    });

    test('upgrade: keeps the higher value', () => {
        assert.equal(applyActiveEffectChange(2, 'upgrade', 4), 4);
        assert.equal(applyActiveEffectChange(2, 'upgrade', 1), 2);
    });

    test('override: replaces current entirely', () => {
        assert.equal(applyActiveEffectChange(2, 'override', 9), 9);
    });

    test('custom is a no-op (no system-specific handler registered)', () => {
        assert.equal(applyActiveEffectChange(5, 'custom', 100), 5);
    });

    test('an unrecognized type key is also a no-op', () => {
        assert.equal(applyActiveEffectChange(5, 'not-a-type', 100), 5);
    });
});

describe('computeActiveEffectFieldValue', () => {
    test('issue #359 regression: a Subtract row on the global roll modifier applies as -value', () => {
        const total = computeActiveEffectFieldValue(
            [{ disabled: false, changes: [{ key: 'system.rollModifier.bonus', type: 'subtract', value: 2 }] }],
            ['system.rollModifier.bonus'],
            0
        );
        assert.equal(total, -2);
    });

    test('ignores disabled effects regardless of change type', () => {
        const total = computeActiveEffectFieldValue(
            [{ disabled: true, changes: [{ key: 'system.rollModifier.bonus', type: 'override', value: 99 }] }],
            ['system.rollModifier.bonus'],
            0
        );
        assert.equal(total, 0);
    });

    test('priority ordering changes the outcome: lower priority applies first', () => {
        const overrideRow = { key: 'k', type: 'override', value: 5 };
        const addRow = { key: 'k', type: 'add', value: 3 };

        const overrideFirst = computeActiveEffectFieldValue(
            [
                { disabled: false, changes: [{ ...overrideRow, priority: 10 }] },
                { disabled: false, changes: [{ ...addRow, priority: 20 }] }
            ],
            ['k'],
            0
        );
        assert.equal(overrideFirst, 8); // override to 5, then +3

        const addFirst = computeActiveEffectFieldValue(
            [
                { disabled: false, changes: [{ ...addRow, priority: 10 }] },
                { disabled: false, changes: [{ ...overrideRow, priority: 20 }] }
            ],
            ['k'],
            0
        );
        assert.equal(addFirst, 5); // +3 to 3, then override to 5

        assert.notEqual(overrideFirst, addFirst);
    });

    test('a row with no explicit priority falls back to its type default priority', () => {
        // downgrade's default priority (30) sorts after add's (20), regardless of array order.
        const total = computeActiveEffectFieldValue(
            [
                { disabled: false, changes: [{ key: 'k', type: 'downgrade', value: 1 }] },
                { disabled: false, changes: [{ key: 'k', type: 'add', value: 5 }] }
            ],
            ['k'],
            0
        );
        // add applies first (0 + 5 = 5), then downgrade keeps the lower of (5, 1) = 1.
        assert.equal(total, 1);
    });

    test('legacy numeric-mode rows still work and use their type default priority', () => {
        const total = computeActiveEffectFieldValue(
            [
                { disabled: false, changes: [{ key: 'k', mode: 2, value: 3 }] }, // legacy add
                { disabled: false, changes: [{ key: 'k', mode: 5, value: 10 }] } // legacy override
            ],
            ['k'],
            0
        );
        // add (priority 20) applies first: 0 + 3 = 3, then override (priority 50): 10.
        assert.equal(total, 10);
    });

    test('ignores rows that do not match any of the requested keys', () => {
        const total = computeActiveEffectFieldValue(
            [{ disabled: false, changes: [{ key: 'system.rollModifier.value', type: 'subtract', value: 2 }] }],
            ['system.rollModifier.bonus'],
            0
        );
        assert.equal(total, 0);
    });

    test('ignores unrecognized change types', () => {
        const total = computeActiveEffectFieldValue(
            [{ disabled: false, changes: [{ key: 'k', type: 'not-a-real-type', value: 99 }] }],
            ['k'],
            5
        );
        assert.equal(total, 5);
    });
});

describe('computeActiveEffectStatBonus', () => {
    test('sums a real v14 ActiveEffectConfig-authored Add change row', () => {
        const total = computeActiveEffectStatBonus(
            [{ disabled: false, changes: [{ key: 'system.stats.str.bonus', type: 'add', value: 1 }] }],
            'str',
            0
        );
        assert.equal(total, 1);
    });

    test('regression: toggling that same effect disabled removes the bonus (issue #330 repro)', () => {
        const effect = {
            disabled: true,
            changes: [{ key: 'system.stats.str.bonus', type: 'add', value: 1 }]
        };
        assert.equal(computeActiveEffectStatBonus([effect], 'str', 0), 0);
        assert.equal(computeActiveEffectStatBonus([{ ...effect, disabled: false }], 'str', 0), 1);
    });

    test('a Subtract row on a core stat bonus applies as -value (same bug path as rollModifier)', () => {
        const total = computeActiveEffectStatBonus(
            [{ disabled: false, changes: [{ key: 'system.stats.str.bonus', type: 'subtract', value: 2 }] }],
            'str',
            0
        );
        assert.equal(total, -2);
    });

    test('mixes an Add and a Subtract row on the same stat', () => {
        const total = computeActiveEffectStatBonus(
            [
                { disabled: false, changes: [{ key: 'system.stats.str.bonus', type: 'add', value: 5 }] },
                { disabled: false, changes: [{ key: 'system.stats.str.bonus', type: 'subtract', value: 2 }] }
            ],
            'str',
            0
        );
        assert.equal(total, 3);
    });

    test('mixes legacy numeric ADD mode with a v14 Subtract row', () => {
        const total = computeActiveEffectStatBonus(
            [
                { disabled: false, changes: [{ key: 'system.stats.str.bonus', mode: 2, value: 1 }] },
                { disabled: false, changes: [{ key: 'system.stats.str.bonus', type: 'subtract', value: 3 }] }
            ],
            'str',
            0
        );
        assert.equal(total, -2);
    });

    test('aliases the legacy .value key onto the same bonus chain', () => {
        const total = computeActiveEffectStatBonus(
            [{ disabled: false, changes: [{ key: 'system.stats.dex.value', mode: 2, value: 1 }] }],
            'dex',
            0
        );
        assert.equal(total, 1);
    });

    test('ignores disabled effects and non-additive changes on other stats', () => {
        const total = computeActiveEffectStatBonus(
            [
                { disabled: true, changes: [{ key: 'system.stats.str.bonus', type: 'add', value: 9 }] },
                { disabled: false, changes: [{ key: 'system.stats.conc.bonus', type: 'add', value: 2 }] }
            ],
            'str',
            0
        );
        assert.equal(total, 0);
    });
});

describe('computeActiveEffectKeyValue', () => {
    test('issue #359: a global roll modifier Subtract row (Drugged effect, -2)', () => {
        const total = computeActiveEffectKeyValue(
            [{ disabled: false, changes: [{ key: 'system.rollModifier.bonus', type: 'subtract', value: 2 }] }],
            'system.rollModifier.bonus',
            0
        );
        assert.equal(total, -2);
    });

    test('ignores disabled effects', () => {
        const total = computeActiveEffectKeyValue(
            [{ disabled: true, changes: [{ key: 'system.rollModifier.bonus', type: 'subtract', value: 2 }] }],
            'system.rollModifier.bonus',
            0
        );
        assert.equal(total, 0);
    });

    test('ignores rows that do not exactly match the requested key (no aliasing, unlike computeActiveEffectStatBonus)', () => {
        const total = computeActiveEffectKeyValue(
            [{ disabled: false, changes: [{ key: 'system.rollModifier.value', type: 'subtract', value: 2 }] }],
            'system.rollModifier.bonus',
            0
        );
        assert.equal(total, 0);
    });

    test('sums multiple enabled Add and Subtract rows across separate effects', () => {
        const total = computeActiveEffectKeyValue(
            [
                { disabled: false, changes: [{ key: 'system.rollModifier.bonus', mode: 2, value: 1 }] },
                { disabled: false, changes: [{ key: 'system.rollModifier.bonus', type: 'subtract', value: 3 }] }
            ],
            'system.rollModifier.bonus',
            0
        );
        assert.equal(total, -2);
    });

    describe('system.move.closing / system.move.rushing (AE-boosted highlight detection)', () => {
        test('no effects: both closing and rushing resolve to false (no boost)', () => {
            const closing = computeActiveEffectKeyValue([], 'system.move.closing', 0) !== 0;
            const rushing = computeActiveEffectKeyValue([], 'system.move.rushing', 0) !== 0;
            assert.equal(closing, false);
            assert.equal(rushing, false);
        });

        test('an effect targeting an unrelated key does not flag either field', () => {
            const effects = [{ disabled: false, changes: [{ key: 'system.stats.str.bonus', type: 'add', value: 3 }] }];
            assert.equal(computeActiveEffectKeyValue(effects, 'system.move.closing', 0) !== 0, false);
            assert.equal(computeActiveEffectKeyValue(effects, 'system.move.rushing', 0) !== 0, false);
        });

        test('a disabled effect targeting closing with a nonzero value does not flag it', () => {
            const effects = [{ disabled: true, changes: [{ key: 'system.move.closing', type: 'add', value: 2 }] }];
            assert.equal(computeActiveEffectKeyValue(effects, 'system.move.closing', 0) !== 0, false);
        });

        test('an enabled Add row on closing flags closing only', () => {
            const effects = [{ disabled: false, changes: [{ key: 'system.move.closing', type: 'add', value: 2 }] }];
            assert.equal(computeActiveEffectKeyValue(effects, 'system.move.closing', 0) !== 0, true);
            assert.equal(computeActiveEffectKeyValue(effects, 'system.move.rushing', 0) !== 0, false);
        });

        test('an enabled Add row on rushing flags rushing only (independence of the two fields)', () => {
            const effects = [{ disabled: false, changes: [{ key: 'system.move.rushing', type: 'add', value: 3 }] }];
            assert.equal(computeActiveEffectKeyValue(effects, 'system.move.closing', 0) !== 0, false);
            assert.equal(computeActiveEffectKeyValue(effects, 'system.move.rushing', 0) !== 0, true);
        });

        test('a net-zero Add row does not flag the field (checks the resulting value, not mere presence)', () => {
            const effects = [{ disabled: false, changes: [{ key: 'system.move.closing', type: 'add', value: 0 }] }];
            assert.equal(computeActiveEffectKeyValue(effects, 'system.move.closing', 0) !== 0, false);
        });
    });
});
