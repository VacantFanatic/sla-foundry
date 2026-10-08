/**
 * Unit tests for item→actor effect duration helpers (no Foundry runtime).
 *
 * Background: the copy used to write the legacy `duration.seconds`, which Foundry v14's
 * ActiveEffectDuration schema (value/units/expiry/expired) silently discards, so a drug's "2 hours"
 * never reached the effect. These tests pin the v14 shape that is written instead.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDurationSeconds, buildCopiedEffectDuration } from '../../module/documents/derived/effect-duration.mjs';
import { computeActiveEffectFieldValue, isEffectActive } from '../../module/documents/derived/active-effects.mjs';

describe('parseDurationSeconds', () => {
    test('parses a number plus hour / minute / day / second units', () => {
        assert.equal(parseDurationSeconds('2 hours'), 7200);
        assert.equal(parseDurationSeconds('1 hour'), 3600);
        assert.equal(parseDurationSeconds('30 minutes'), 1800);
        assert.equal(parseDurationSeconds('10 min'), 600);
        assert.equal(parseDurationSeconds('3 Days'), 259200);
        assert.equal(parseDurationSeconds('45 seconds'), 45);
    });

    test('returns null when there is no fixed length to resolve', () => {
        for (const text of ['', undefined, null, 'Scene', 'Permanent', 'until dawn', '5', 'rounds 4']) {
            assert.equal(parseDurationSeconds(text), null, String(text));
        }
    });

    test('refuses dice expressions instead of resolving only the leading digit', () => {
        assert.equal(parseDurationSeconds('1d6 hours'), null);
        assert.equal(parseDurationSeconds('2D10 minutes'), null);
        assert.equal(parseDurationSeconds('2 d 6 minutes'), null);
    });
});

describe('buildCopiedEffectDuration', () => {
    test('a resolved item duration becomes a v14 real-time duration, never the legacy seconds key', () => {
        const d = buildCopiedEffectDuration({ value: null, units: 'seconds', expiry: null, expired: false }, 7200);
        assert.deepEqual(d, { value: 7200, units: 'seconds', expiry: null, expired: false });
        assert.equal('seconds' in d, false);
    });

    test('the item duration overrides a different unit on the source effect', () => {
        const d = buildCopiedEffectDuration({ value: 3, units: 'rounds', expiry: 'turnEnd', expired: false }, 60);
        assert.deepEqual(d, { value: 60, units: 'seconds', expiry: 'turnEnd', expired: false });
    });

    test('with no item duration, the effect keeps its own Duration-tab settings', () => {
        const own = { value: 3, units: 'rounds', expiry: 'turnEnd', expired: false };
        assert.deepEqual(buildCopiedEffectDuration(own, null), own);
        assert.deepEqual(buildCopiedEffectDuration(own, undefined), own);
        assert.deepEqual(buildCopiedEffectDuration(undefined, null), { expired: false });
    });

    test('a copy never starts out expired, and the source object is not mutated', () => {
        const source = { value: 60, units: 'seconds', expired: true };
        assert.equal(buildCopiedEffectDuration(source, null).expired, false);
        assert.equal(buildCopiedEffectDuration(source, 120).expired, false);
        assert.equal(source.expired, true);
        assert.equal(source.value, 60);
    });
});

describe('isEffectActive / expiry in derived stat math', () => {
    const change = { key: 'system.stats.str.bonus', type: 'add', value: 2 };

    test('disabled and suppressed (expired) effects are inactive', () => {
        assert.equal(isEffectActive({ changes: [change] }), true);
        assert.equal(isEffectActive({ disabled: false, isSuppressed: false }), true);
        assert.equal(isEffectActive({ disabled: true }), false);
        assert.equal(isEffectActive({ isSuppressed: true }), false);
        assert.equal(isEffectActive(null), false);
    });

    test('an expired effect no longer contributes, but a live one still does', () => {
        const live = { changes: [change] };
        const expired = { changes: [change], isSuppressed: true };
        const disabled = { changes: [change], disabled: true };
        assert.equal(computeActiveEffectFieldValue([live], ['system.stats.str.bonus'], 3), 5);
        assert.equal(computeActiveEffectFieldValue([live, expired, disabled], ['system.stats.str.bonus'], 3), 5);
        assert.equal(computeActiveEffectFieldValue([expired], ['system.stats.str.bonus'], 3), 3);
    });
});
