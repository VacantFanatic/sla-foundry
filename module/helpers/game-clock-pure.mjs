/**
 * Pure helpers for the GM game clock and the combat round length (no Foundry runtime).
 */

/** Seconds per combat round used when the world setting holds something unusable. */
export const DEFAULT_SECONDS_PER_ROUND = 6;

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
