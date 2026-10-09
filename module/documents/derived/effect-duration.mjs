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

/** Duration units that run on the world clock (the rest are combat-based: rounds, turns). */
export const TIME_DURATION_UNITS = Object.freeze(['seconds', 'minutes', 'hours', 'days', 'months', 'years']);

/**
 * Whether a duration runs on the world clock.
 * @param {{ units?: unknown } | null | undefined} duration
 * @returns {boolean}
 */
export function isTimeBasedDuration(duration) {
    return TIME_DURATION_UNITS.includes(duration?.units);
}

/**
 * The expiry event that actually gates a duration. Foundry's schema fills `duration.expiry` with
 * `"turnStart"` whenever an effect is created with a numeric duration, and core then only expires the effect
 * when its owner's next turn starts (a clock change satisfies the event only outside combat), so in combat a
 * "1 hour" effect survives eight hours passing. For a time-based duration that default is not a choice anyone
 * made, so it counts as no event; any other expiry (turnEnd, roundStart, combatEnd, ...) is kept.
 * @param {{ units?: unknown, expiry?: unknown } | null | undefined} duration
 * @returns {string | null}
 */
export function effectiveExpiry(duration) {
    const expiry = duration?.expiry || null;
    if (expiry === 'turnStart' && isTimeBasedDuration(duration)) return null;
    return expiry;
}

/**
 * Whether a timed effect has run out and nothing else is holding it: it is time-based, has a finite length,
 * the remaining time (computed from the world clock) is zero or less, and its expiry event is unset or only
 * the schema default. Rounds/turns durations and effects waiting on an explicit event are left to core.
 * Works on a live ActiveEffect or a plain object with the same fields.
 * @param {{ duration?: { units?: unknown, expiry?: unknown, remaining?: unknown, value?: unknown } | null } | null | undefined} effect
 * @returns {boolean}
 */
export function isTimeDurationOverdue(effect) {
    const duration = effect?.duration;
    if (!duration || !isTimeBasedDuration(duration)) return false;
    if (effectiveExpiry(duration) !== null) return false;
    return Number.isFinite(duration.remaining) && duration.remaining <= 0;
}

/**
 * The effects whose expiry should be recorded now: overdue (see {@link isTimeDurationOverdue}) and not
 * already marked expired.
 * @param {Iterable<{ duration?: { expired?: unknown } }> | null | undefined} effects
 * @returns {object[]}
 */
export function selectOverdueEffects(effects) {
    return Array.from(effects ?? []).filter((e) => e?.duration?.expired !== true && isTimeDurationOverdue(e));
}

/**
 * The `duration` to put on a copy of an item's effect. A parsed item duration wins over the effect's own
 * `value`/`units`; otherwise the source effect's own duration (set on its Duration tab) is kept. A source
 * `expiry` is kept unless the item text names one, except that the schema-default `turnStart` on a time-based
 * duration is dropped (see {@link effectiveExpiry}). Either way `expired` is cleared so a copy never starts
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
    // The schema's default turnStart is not a choice for a clock-based duration; see effectiveExpiry.
    if ('expiry' in duration && effectiveExpiry(duration) === null) duration.expiry = null;
    return duration;
}

/**
 * The effects recorded as expired whose time has not actually run out any more, because the clock was moved back.
 * Reads the stored flag (`_source`), since the prepared `duration.expired` is already recomputed from the clock.
 * Only clock-based durations; rounds and turns follow combat, which core handles.
 * @param {Iterable<{ _source?: { duration?: { expired?: unknown } }, duration?: { units?: unknown, remaining?: unknown, expired?: unknown } }> | null | undefined} effects
 * @returns {object[]}
 */
export function selectRevivedEffects(effects) {
    return Array.from(effects ?? []).filter((e) => {
        const stored = e?._source?.duration?.expired ?? e?.duration?.expired;
        const duration = e?.duration;
        return (
            stored === true &&
            isTimeBasedDuration(duration) &&
            Number.isFinite(duration.remaining) &&
            duration.remaining > 0
        );
    });
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

const DURATION_UNIT_LABELS = {
    seconds: ['second', 'seconds'],
    minutes: ['minute', 'minutes'],
    hours: ['hour', 'hours'],
    days: ['day', 'days'],
    months: ['month', 'months'],
    years: ['year', 'years'],
    rounds: ['round', 'rounds'],
    turns: ['turn', 'turns']
};

/**
 * Readable length of a stored effect duration, e.g. `3 rounds`, `2 hours` (7200 seconds collapses to the
 * largest whole unit up to days). `null` when the effect has no finite length of its own.
 * @param {{ value?: unknown, units?: unknown } | null | undefined} duration
 * @returns {string | null}
 */
export function formatEffectDuration(duration) {
    let value = Number(duration?.value);
    let units = duration?.units;
    if (!Number.isFinite(value) || value <= 0 || !Object.hasOwn(DURATION_UNIT_LABELS, units)) return null;
    if (units === 'seconds') {
        for (const [unit, size] of [
            ['days', 86400],
            ['hours', 3600],
            ['minutes', 60]
        ]) {
            if (value % size === 0) {
                value /= size;
                units = unit;
                break;
            }
        }
    }
    const [singular, plural] = DURATION_UNIT_LABELS[units];
    return `${value} ${value === 1 ? singular : plural}`;
}

/**
 * What a drug's chat card should say for its duration: the item's own text when present, otherwise the length
 * set on the Duration tab of its first effect that has one, otherwise `Unknown`. Reads the stored duration
 * (`_source`): the prepared one converts rounds to seconds once `CONFIG.time.roundTime` is set.
 * @param {unknown} itemText The drug's `system.duration` text.
 * @param {Iterable<{ duration?: { value?: unknown, units?: unknown } }> | null | undefined} effects
 * @returns {string}
 */
export function describeDrugDuration(itemText, effects) {
    const text = String(itemText ?? '').trim();
    if (text) return text;
    for (const effect of effects ?? []) {
        const label = formatEffectDuration(effect?._source?.duration ?? effect?.duration);
        if (label) return label;
    }
    return 'Unknown';
}
