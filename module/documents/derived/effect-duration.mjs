/**
 * Pure helpers for the duration of an Active Effect copied from an item onto an actor
 * (no document runtime).
 *
 * Foundry v14's `ActiveEffect` duration model has `value`, `units`, `expiry` and `expired` only.
 * The legacy `duration.seconds` key is not in the schema, so writing it is silently discarded
 * (a drug's "2 hours" used to vanish on copy and the effect never expired).
 */

const SECONDS_PER_UNIT = [
    [/hour/, 3600],
    [/min/, 60],
    [/day/, 86400],
    [/sec/, 1]
];

/**
 * Parses an item's free-text duration (e.g. "2 hours", "30 minutes", "1 day") into seconds.
 * Returns `null` when it can't be resolved to one fixed length, including dice expressions such as
 * "1d6 hours" (resolving only the leading digit would silently give the wrong length) and units
 * like "Scene" or "Permanent": those copy with no duration, i.e. until removed.
 * @param {unknown} str
 * @returns {number | null}
 */
export function parseDurationSeconds(str) {
    if (!str) return null;
    const s = String(str).toLowerCase();
    if (/\d\s*d\s*\d/.test(s)) return null;
    const n = parseInt(s.match(/\d+/)?.[0] ?? '', 10);
    if (Number.isNaN(n)) return null;
    for (const [unit, seconds] of SECONDS_PER_UNIT) {
        if (unit.test(s)) return n * seconds;
    }
    return null;
}

/**
 * The `duration` to put on a copy of an item's effect. A resolved item duration wins and becomes a
 * real-time duration in seconds; otherwise the source effect's own duration (set on its Duration tab)
 * is kept. Either way `expired` is cleared so a copy never starts out expired.
 * @param {{ value?: unknown, units?: unknown, expiry?: unknown, expired?: unknown } | null | undefined} sourceDuration
 * @param {number | null | undefined} seconds
 * @returns {object}
 */
export function buildCopiedEffectDuration(sourceDuration, seconds) {
    const duration = { ...(sourceDuration ?? {}), expired: false };
    if (Number.isFinite(seconds)) {
        duration.value = seconds;
        duration.units = 'seconds';
    }
    return duration;
}
