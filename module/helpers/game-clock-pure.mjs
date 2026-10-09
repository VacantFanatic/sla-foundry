/**
 * Pure helpers for the GM game clock and the combat round length (no Foundry runtime).
 */

/** Seconds per combat round used when the world setting holds something unusable. */
export const DEFAULT_SECONDS_PER_ROUND = 5;

/**
 * Turns the `secondsPerRound` world setting into a value safe to hand to `CONFIG.time.roundTime`:
 * a non-negative whole number of seconds. `0` is valid and means "combat does not move the game clock".
 * Anything that is not a finite number falls back to the default.
 * @param {unknown} value
 * @returns {number}
 */
export function normalizeRoundSeconds(value) {
    const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    if (typeof n !== 'number' || !Number.isFinite(n)) return DEFAULT_SECONDS_PER_ROUND;
    return Math.max(0, Math.round(n));
}

/** Quick time steps offered by the GM clock, shortest first. Labels live in lang under `SLA.GameClock.*`. */
export const CLOCK_PRESETS = Object.freeze([
    Object.freeze({ id: 'minutes10', seconds: 600 }),
    Object.freeze({ id: 'hour1', seconds: 3600 }),
    Object.freeze({ id: 'hours8', seconds: 28800 }),
    Object.freeze({ id: 'day1', seconds: 86400 })
]);

/** A forward clock move of at least this many seconds, while a combat is running, offers to end that combat. */
export const END_COMBAT_PROMPT_SECONDS = 3600;

/**
 * Whether a clock move from the window should ask the GM to end the running combat: the clock went forward by
 * at least {@link END_COMBAT_PROMPT_SECONDS} while at least one combat is in progress. Rewinding never asks.
 * @param {number} deltaSeconds New world time minus old world time.
 * @param {number} runningCombats How many started combats exist.
 * @returns {boolean}
 */
export function shouldOfferEndCombat(deltaSeconds, runningCombats) {
    return Number.isFinite(deltaSeconds) && deltaSeconds >= END_COMBAT_PROMPT_SECONDS && Number(runningCombats) > 0;
}

/**
 * The preset rows for one direction of the clock: positive seconds to advance, negative to rewind.
 * @param {'advance' | 'rewind'} direction
 * @returns {Array<{ id: string, seconds: number }>}
 */
export function buildClockPresetRows(direction) {
    const sign = direction === 'rewind' ? -1 : 1;
    return CLOCK_PRESETS.map(({ id, seconds }) => ({ id, seconds: sign * seconds }));
}

/**
 * Validates an amount handed to `game.sla.advanceTime`: a finite, non-zero number of seconds
 * (negative rewinds). Returns the number, or `null` when it is unusable.
 * @param {unknown} value
 * @returns {number | null}
 */
export function parseAdvanceSeconds(value) {
    const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    return typeof n === 'number' && Number.isFinite(n) && n !== 0 ? n : null;
}

/* -------------------------------------------------------------------------- */
/*  Date handling                                                              */
/* -------------------------------------------------------------------------- */

/**
 * A world time as the fields the clock window edits. `month` and `day` are 1-based, the way people write dates
 * (Foundry's own components are 0-based).
 * @typedef {{ year: number, month: number, day: number, hour: number, minute: number }} ClockFields
 */

/**
 * The minimal slice of Foundry's `CalendarData` this module needs, so it can be tested without Foundry.
 * @typedef {object} CalendarLike
 * @property {{ hoursPerDay: number, minutesPerHour: number, secondsPerMinute: number }} days
 * @property {{ values: Array<{ name: string, days: number, leapDays?: number }> }} months
 * @property {(year: number) => boolean} isLeapYear
 * @property {(components: object) => number} componentsToTime
 * @property {(time: number) => { year: number, month: number, dayOfMonth: number, hour: number, minute: number, second: number, leapYear?: boolean }} timeToComponents
 */

/**
 * Whether a year is a leap year *as the calendar displays it*. Foundry's world calendar disagrees with itself:
 * `isLeapYear` says 8, 12, ... 2200, 2204 but the dates it shows (`timeToComponents`) have 29 February in
 * 7, 11, ... 2199, 2203. The clock window is about what the GM sees, so the displayed rule wins; the flag is read
 * from the components of a day in the middle of the year, falling back to `isLeapYear`.
 * @param {CalendarLike} calendar
 * @param {number} year
 * @returns {boolean}
 */
export function displayedLeapYear(calendar, year) {
    const shown = calendar.timeToComponents(calendar.componentsToTime({ year, day: 180 }));
    if (shown.year === year && typeof shown.leapYear === 'boolean') return shown.leapYear;
    return calendar.isLeapYear(year);
}

/**
 * Days in a month of a given year, as the calendar displays it (see {@link displayedLeapYear}). This is what the
 * form offers as a day limit; `worldTimeFromFields` makes the final call against the real conversion.
 * @param {CalendarLike} calendar
 * @param {number} year
 * @param {number} monthIndex 0-based month index
 * @returns {number}
 */
export function monthLength(calendar, year, monthIndex) {
    const month = calendar.months.values[monthIndex];
    if (!month) return 0;
    return displayedLeapYear(calendar, year) ? (month.leapDays ?? month.days) : month.days;
}

/**
 * Zero-based day of the year for a month and a 1-based day of month.
 * @param {CalendarLike} calendar
 * @param {number} year
 * @param {number} monthIndex 0-based
 * @param {number} day 1-based day of month
 * @returns {number}
 */
export function dayOfYear(calendar, year, monthIndex, day) {
    let total = 0;
    for (let i = 0; i < monthIndex; i++) total += monthLength(calendar, year, i);
    return total + (day - 1);
}

/**
 * The editable fields for a world time.
 * @param {CalendarLike} calendar
 * @param {number} seconds
 * @returns {ClockFields}
 */
export function fieldsFromTime(calendar, seconds) {
    const c = calendar.timeToComponents(seconds);
    return { year: c.year, month: c.month + 1, day: c.dayOfMonth + 1, hour: c.hour, minute: c.minute };
}

/**
 * Converts date fields to a world time in seconds, or names what is wrong.
 *
 * Foundry's `componentsToTime` and `timeToComponents` are not exact inverses around leap years in the world
 * calendar (converting a date and reading it back can land a day off), and `timeToComponents` is what the
 * calendar displays, so the result is searched for: the day start whose displayed date is the one requested.
 * A date that no time displays as (the calendar skips or repeats it) is reported as `unreachable-date`.
 * @param {CalendarLike} calendar
 * @param {Partial<ClockFields>} fields
 * @returns {{ ok: true, seconds: number } | { ok: false, error: string }}
 */
export function worldTimeFromFields(calendar, fields) {
    const { year, month, day, hour, minute } = fields ?? {};
    const isInt = (n) => Number.isInteger(n);
    if (!isInt(year) || year < 0) return { ok: false, error: 'invalid-year' };
    if (!isInt(month) || month < 1 || month > calendar.months.values.length)
        return { ok: false, error: 'invalid-month' };
    const monthIndex = month - 1;
    if (!isInt(day) || day < 1 || day > monthLength(calendar, year, monthIndex))
        return { ok: false, error: 'invalid-day' };
    const { hoursPerDay, minutesPerHour, secondsPerMinute } = calendar.days;
    if (!isInt(hour) || hour < 0 || hour >= hoursPerDay) return { ok: false, error: 'invalid-hour' };
    if (!isInt(minute) || minute < 0 || minute >= minutesPerHour) return { ok: false, error: 'invalid-minute' };

    const baseDay = dayOfYear(calendar, year, monthIndex, day);
    const secondsOfDay = hour * minutesPerHour * secondsPerMinute + minute * secondsPerMinute;
    for (const offset of [0, -1, 1, -2, 2]) {
        const dayStart = calendar.componentsToTime({ year, day: baseDay + offset });
        const shown = calendar.timeToComponents(dayStart);
        if (shown.year !== year || shown.month !== monthIndex || shown.dayOfMonth !== day - 1) continue;
        if (shown.hour !== 0 || shown.minute !== 0 || shown.second !== 0) continue;
        return { ok: true, seconds: dayStart + secondsOfDay };
    }
    return { ok: false, error: 'unreachable-date' };
}

/**
 * The date and time strings the clock window shows, e.g. `{ date: '12 March 2204', time: '14:30:05' }`.
 * Month names in Foundry's calendar are localization keys, so a `localize` function is passed in.
 * @param {CalendarLike} calendar
 * @param {number} seconds
 * @param {(key: string) => string} [localize]
 * @returns {{ date: string, time: string }}
 */
export function formatClockParts(calendar, seconds, localize = (key) => key) {
    const c = calendar.timeToComponents(seconds);
    const month = calendar.months.values[c.month];
    const two = (n) => String(n).padStart(2, '0');
    return {
        date: `${c.dayOfMonth + 1} ${month ? localize(month.name) : ''} ${c.year}`.replace(/\s+/g, ' ').trim(),
        time: `${two(c.hour)}:${two(c.minute)}:${two(c.second)}`
    };
}
