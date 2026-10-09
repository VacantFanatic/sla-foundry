/**
 * Unit tests for the pure game-clock / round-length helpers (no Foundry runtime).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
    CLOCK_PRESETS,
    DEFAULT_SECONDS_PER_ROUND,
    END_COMBAT_PROMPT_SECONDS,
    shouldOfferEndCombat,
    buildClockPresetRows,
    dayOfYear,
    displayedLeapYear,
    fieldsFromTime,
    formatClockParts,
    monthLength,
    normalizeRoundSeconds,
    parseAdvanceSeconds,
    worldTimeFromFields
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

/**
 * A miniature of Foundry's world calendar INCLUDING its quirk: `isLeapYear` and `componentsToTime` use one leap
 * rule (every 4th year from 8) while `timeToComponents`, which is what gets displayed, uses another (every 4th
 * year from 7), so converting a date and reading it back can land a day off. Verified against the real calendar
 * by the live test in tests/e2e/regression-game-clock.spec.js; this fake only exercises the reconcile logic.
 */
function makeQuirkyCalendar({ skipDay } = {}) {
    const months = [
        ['January', 31],
        ['February', 28, 29],
        ['March', 31],
        ['April', 30],
        ['May', 31],
        ['June', 30],
        ['July', 31],
        ['August', 31],
        ['September', 30],
        ['October', 31],
        ['November', 30],
        ['December', 31]
    ].map(([name, days, leapDays]) => ({ name, days, leapDays }));
    const isLeapYear = (y) => y >= 8 && (y - 8) % 4 === 0;
    const displayedLeap = (y) => y >= 7 && (y - 7) % 4 === 0;
    const DAY = 86400;
    return {
        days: { hoursPerDay: 24, minutesPerHour: 60, secondsPerMinute: 60 },
        months: { values: months },
        isLeapYear,
        componentsToTime({ year = 0, day = 0, hour = 0, minute = 0, second = 0 }) {
            let totalDays = 0;
            for (let y = 0; y < year; y++) totalDays += isLeapYear(y) ? 366 : 365;
            return (totalDays + day) * DAY + hour * 3600 + minute * 60 + second;
        },
        timeToComponents(time) {
            let remaining = Math.floor(time / DAY);
            let secondsOfDay = time - remaining * DAY;
            let year = 0;
            for (;;) {
                const length = displayedLeap(year) ? 366 : 365;
                if (remaining < length) break;
                remaining -= length;
                year++;
            }
            if (skipDay && year === skipDay.year && remaining >= skipDay.dayOfYear) remaining += 1;
            let dayOfMonth = remaining;
            let month = 0;
            for (; month < months.length; month++) {
                const md = displayedLeap(year) ? (months[month].leapDays ?? months[month].days) : months[month].days;
                if (dayOfMonth < md) break;
                dayOfMonth -= md;
            }
            const hour = Math.floor(secondsOfDay / 3600);
            secondsOfDay -= hour * 3600;
            const minute = Math.floor(secondsOfDay / 60);
            return {
                year,
                month,
                dayOfMonth,
                day: remaining,
                hour,
                minute,
                second: secondsOfDay - minute * 60,
                leapYear: displayedLeap(year)
            };
        }
    };
}

describe('calendar-aware date helpers', () => {
    const cal = makeQuirkyCalendar();

    test('displayedLeapYear follows the displayed rule, not isLeapYear', () => {
        assert.equal(cal.isLeapYear(2204), true);
        assert.equal(displayedLeapYear(cal, 2204), false);
        assert.equal(cal.isLeapYear(2203), false);
        assert.equal(displayedLeapYear(cal, 2203), true);
        assert.equal(displayedLeapYear(cal, 7), true);
        assert.equal(displayedLeapYear(cal, 8), false);
    });

    test('monthLength and dayOfYear use the displayed leap rule', () => {
        assert.equal(monthLength(cal, 2203, 1), 29);
        assert.equal(monthLength(cal, 2204, 1), 28);
        assert.equal(monthLength(cal, 2204, 99), 0);
        assert.equal(dayOfYear(cal, 2203, 2, 1), 60);
        assert.equal(dayOfYear(cal, 2204, 2, 1), 59);
        assert.equal(dayOfYear(cal, 2204, 0, 1), 0);
    });

    test('fieldsFromTime returns 1-based month and day', () => {
        const t = worldTimeFromFields(cal, { year: 2204, month: 3, day: 12, hour: 14, minute: 30 });
        assert.equal(t.ok, true);
        assert.deepEqual(fieldsFromTime(cal, t.seconds), { year: 2204, month: 3, day: 12, hour: 14, minute: 30 });
    });

    test('every date round-trips to the date the calendar displays, including the leap-day edges', () => {
        const dates = [
            { year: 0, month: 1, day: 1, hour: 0, minute: 0 },
            { year: 7, month: 2, day: 29, hour: 23, minute: 59 },
            { year: 8, month: 2, day: 28, hour: 0, minute: 1 },
            { year: 8, month: 3, day: 1, hour: 12, minute: 0 },
            { year: 2203, month: 2, day: 29, hour: 6, minute: 5 },
            { year: 2203, month: 3, day: 1, hour: 0, minute: 0 },
            { year: 2204, month: 2, day: 28, hour: 18, minute: 45 },
            { year: 2204, month: 3, day: 1, hour: 0, minute: 0 },
            { year: 2204, month: 12, day: 31, hour: 23, minute: 59 },
            { year: 2205, month: 1, day: 1, hour: 0, minute: 0 }
        ];
        for (const fields of dates) {
            const result = worldTimeFromFields(cal, fields);
            assert.equal(result.ok, true, JSON.stringify(fields));
            assert.deepEqual(fieldsFromTime(cal, result.seconds), fields, JSON.stringify(fields));
        }
    });

    test('a naive componentsToTime would land on the wrong day here (so the search is needed)', () => {
        const naive = cal.componentsToTime({ year: 2204, day: dayOfYear(cal, 2204, 2, 1) });
        assert.notDeepEqual(
            { m: cal.timeToComponents(naive).month, d: cal.timeToComponents(naive).dayOfMonth },
            { m: 2, d: 0 }
        );
        assert.equal(worldTimeFromFields(cal, { year: 2204, month: 3, day: 1, hour: 0, minute: 0 }).ok, true);
    });

    test('29 February exists only in displayed leap years', () => {
        assert.equal(worldTimeFromFields(cal, { year: 2203, month: 2, day: 29, hour: 0, minute: 0 }).ok, true);
        assert.deepEqual(worldTimeFromFields(cal, { year: 2204, month: 2, day: 29, hour: 0, minute: 0 }), {
            ok: false,
            error: 'invalid-day'
        });
    });

    test('names the invalid field', () => {
        const ok = { year: 2204, month: 3, day: 12, hour: 14, minute: 30 };
        const error = (patch) => worldTimeFromFields(cal, { ...ok, ...patch }).error;
        assert.equal(error({ year: -1 }), 'invalid-year');
        assert.equal(error({ year: 2204.5 }), 'invalid-year');
        assert.equal(error({ year: undefined }), 'invalid-year');
        assert.equal(error({ month: 0 }), 'invalid-month');
        assert.equal(error({ month: 13 }), 'invalid-month');
        assert.equal(error({ day: 0 }), 'invalid-day');
        assert.equal(error({ month: 4, day: 31 }), 'invalid-day');
        assert.equal(error({ hour: 24 }), 'invalid-hour');
        assert.equal(error({ hour: -1 }), 'invalid-hour');
        assert.equal(error({ minute: 60 }), 'invalid-minute');
        assert.equal(error({ minute: 1.5 }), 'invalid-minute');
        assert.equal(worldTimeFromFields(cal, undefined).error, 'invalid-year');
    });

    test('reports a date the calendar never displays as unreachable instead of guessing', () => {
        const skipping = makeQuirkyCalendar({ skipDay: { year: 2204, dayOfYear: 100 } });
        // 2204 day 100 is April 10 (non-leap displayed): the skipping calendar jumps past one displayed day.
        const results = [9, 10, 11].map((day) =>
            worldTimeFromFields(skipping, { year: 2204, month: 4, day, hour: 0, minute: 0 })
        );
        assert.ok(results.some((r) => r.ok === false && r.error === 'unreachable-date'));
    });
});

describe('formatClockParts', () => {
    const cal = makeQuirkyCalendar();

    test('formats a date with a localized month name and a zero-padded time', () => {
        const t = worldTimeFromFields(cal, { year: 2204, month: 3, day: 12, hour: 4, minute: 5 }).seconds + 9;
        assert.deepEqual(
            formatClockParts(cal, t, (key) => `L(${key})`),
            { date: '12 L(March) 2204', time: '04:05:09' }
        );
    });

    test('works without a localize function and at the start of time', () => {
        assert.deepEqual(formatClockParts(cal, 0), { date: '1 January 0', time: '00:00:00' });
    });
});

describe('shouldOfferEndCombat', () => {
    test('asks only for a forward move of an hour or more while a combat is running', () => {
        assert.equal(END_COMBAT_PROMPT_SECONDS, 3600);
        assert.equal(shouldOfferEndCombat(3600, 1), true);
        assert.equal(shouldOfferEndCombat(17 * 3600, 2), true);
        assert.equal(shouldOfferEndCombat(3599, 1), false);
        assert.equal(shouldOfferEndCombat(600, 1), false);
        assert.equal(shouldOfferEndCombat(-86400, 1), false);
        assert.equal(shouldOfferEndCombat(86400, 0), false);
        assert.equal(shouldOfferEndCombat(NaN, 1), false);
    });
});
