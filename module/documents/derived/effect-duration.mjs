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

/** Words that mean "until the combat/scene is over" when no number-and-unit is given. */
const COMBAT_END_WORDS = /\b(scene|encounter|combat|battle)\b/;

/**
 * Turns an item's free-text duration into a v14 duration fragment, or `null` for "no time limit".
 *
 * - `2 hours`, `30 minutes`, `1 day`, `45 seconds` -> `{ value: <seconds>, units: 'seconds' }` (game time,
 *   driven by the world clock)
 * - `3 rounds`, `2 turns` -> `{ value: 3, units: 'rounds' }` / `{ value: 2, units: 'turns' }` (combat time)
 * - `Scene`, `Encounter`, `End of combat` -> `{ expiry: 'combatEnd' }`
 * - anything else, including dice such as `1d6 hours` (resolving only the leading digit would silently give
 *   the wrong length), `Permanent`, or empty text -> `null`
 * @param {unknown} text
 * @returns {{ value: number, units: 'seconds' | 'rounds' | 'turns' } | { expiry: 'combatEnd' } | null}
 */
export function parseItemDuration(text) {
    if (!text) return null;
    const s = String(text).toLowerCase();
    if (/\d\s*d\s*\d/.test(s)) return null;

    const n = parseInt(s.match(/\d+/)?.[0] ?? '', 10);
    if (!Number.isNaN(n)) {
        if (/\bturns?\b/.test(s)) return { value: n, units: 'turns' };
        if (/\brounds?\b/.test(s)) return { value: n, units: 'rounds' };
        for (const [unit, seconds] of SECONDS_PER_UNIT) {
            if (unit.test(s)) return { value: n * seconds, units: 'seconds' };
        }
    }
    if (COMBAT_END_WORDS.test(s)) return { expiry: 'combatEnd' };
    return null;
}

/**
 * The `duration` to put on a copy of an item's effect. A parsed item duration wins over the effect's own
 * `value`/`units`; otherwise the source effect's own duration (set on its Duration tab) is kept. A source
 * `expiry` is kept unless the item text names one. Either way `expired` is cleared so a copy never starts
 * out expired.
 * @param {{ value?: unknown, units?: unknown, expiry?: unknown, expired?: unknown } | null | undefined} sourceDuration
 * @param {ReturnType<typeof parseItemDuration> | undefined} parsed
 * @returns {object}
 */
export function buildCopiedEffectDuration(sourceDuration, parsed) {
    const duration = { ...(sourceDuration ?? {}), expired: false };
    if (parsed && 'units' in parsed) {
        duration.value = parsed.value;
        duration.units = parsed.units;
    }
    if (parsed && 'expiry' in parsed) duration.expiry = parsed.expiry;
    return duration;
}

/**
 * Whether every one of these effects has expired. An empty list is not "all expired": there is nothing to
 * switch off. Used to decide when a drug whose copied effects were all timed can be switched off.
 * @param {Iterable<{ duration?: { expired?: unknown } }> | null | undefined} effects
 * @returns {boolean}
 */
export function allEffectsExpired(effects) {
    const list = Array.from(effects ?? []);
    return list.length > 0 && list.every((e) => e?.duration?.expired === true);
}
