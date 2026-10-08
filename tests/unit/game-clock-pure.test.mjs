/**
 * Unit tests for the pure game-clock / round-length helpers (no Foundry runtime).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
    CLOCK_PRESETS,
    DEFAULT_SECONDS_PER_ROUND,
    buildClockPresetRows,
    normalizeRoundSeconds,
    parseAdvanceSeconds
} from '../../module/helpers/game-clock-pure.mjs';

describe('normalizeRoundSeconds', () => {
    test('keeps a valid whole number, including 0 (combat does not move the clock)', () => {
        assert.equal(normalizeRoundSeconds(6), 6);
        assert.equal(normalizeRoundSeconds(10), 10);
        assert.equal(normalizeRoundSeconds(0), 0);
    });

    test('rounds fractions and clamps negatives to 0', () => {
        assert.equal(normalizeRoundSeconds(2.6), 3);
        assert.equal(normalizeRoundSeconds(-4), 0);
    });

    test('accepts a numeric string', () => {
        assert.equal(normalizeRoundSeconds('12'), 12);
    });

    test('falls back to the default for anything that is not a finite number', () => {
        for (const bad of [undefined, null, NaN, Infinity, '', 'six', {}, []]) {
            assert.equal(normalizeRoundSeconds(bad), DEFAULT_SECONDS_PER_ROUND, String(bad));
        }
    });
});

describe('clock presets', () => {
    test('offers 10 minutes, 1 hour, 8 hours and 1 day, shortest first', () => {
        assert.deepEqual(
            CLOCK_PRESETS.map((p) => [p.id, p.seconds]),
            [
                ['minutes10', 600],
                ['hour1', 3600],
                ['hours8', 28800],
                ['day1', 86400]
            ]
        );
    });

    test('advance rows are positive and rewind rows are the same steps negated', () => {
        const advance = buildClockPresetRows('advance');
        const rewind = buildClockPresetRows('rewind');
        assert.deepEqual(
            advance.map((r) => r.seconds),
            [600, 3600, 28800, 86400]
        );
        assert.deepEqual(
            rewind.map((r) => r.seconds),
            [-600, -3600, -28800, -86400]
        );
        assert.deepEqual(
            advance.map((r) => r.id),
            rewind.map((r) => r.id)
        );
    });

    test('building rows does not alter the preset table', () => {
        buildClockPresetRows('rewind');
        assert.equal(CLOCK_PRESETS[0].seconds, 600);
    });
});

describe('parseAdvanceSeconds', () => {
    test('accepts finite non-zero numbers (negative rewinds) and numeric strings', () => {
        assert.equal(parseAdvanceSeconds(3600), 3600);
        assert.equal(parseAdvanceSeconds(-600), -600);
        assert.equal(parseAdvanceSeconds('120'), 120);
        assert.equal(parseAdvanceSeconds(0.5), 0.5);
    });

    test('rejects zero and anything that is not a finite number', () => {
        for (const bad of [0, '0', '', 'abc', NaN, Infinity, null, undefined, {}, []]) {
            assert.equal(parseAdvanceSeconds(bad), null, String(bad));
        }
    });
});
