/**
 * Unit tests for item→actor effect duration helpers (no Foundry runtime).
 *
 * Background: the copy used to write the legacy `duration.seconds`, which Foundry v14's
 * ActiveEffectDuration schema (value/units/expiry/expired) silently discards, so a drug's "2 hours"
 * never reached the effect. These tests pin the v14 shape that is written instead.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
    parseItemDuration,
    buildCopiedEffectDuration,
    allEffectsExpired,
    effectiveExpiry,
    isTimeBasedDuration,
    isTimeDurationOverdue,
    selectOverdueEffects,
    selectRevivedEffects,
    formatEffectDuration,
    describeDrugDuration
} from '../../module/documents/derived/effect-duration.mjs';
import { computeActiveEffectFieldValue, isEffectActive } from '../../module/documents/derived/active-effects.mjs';

describe('parseItemDuration', () => {
    test('parses a number plus hour / minute / day / second units into game-time seconds', () => {
        const secs = (text) => parseItemDuration(text);
        assert.deepEqual(secs('2 hours'), { value: 7200, units: 'seconds' });
        assert.deepEqual(secs('1 hour'), { value: 3600, units: 'seconds' });
        assert.deepEqual(secs('30 minutes'), { value: 1800, units: 'seconds' });
        assert.deepEqual(secs('10 min'), { value: 600, units: 'seconds' });
        assert.deepEqual(secs('3 Days'), { value: 259200, units: 'seconds' });
        assert.deepEqual(secs('45 seconds'), { value: 45, units: 'seconds' });
    });

    test('parses rounds and turns into combat-time units', () => {
        assert.deepEqual(parseItemDuration('3 rounds'), { value: 3, units: 'rounds' });
        assert.deepEqual(parseItemDuration('1 Round'), { value: 1, units: 'rounds' });
        assert.deepEqual(parseItemDuration('2 turns'), { value: 2, units: 'turns' });
        assert.deepEqual(parseItemDuration('1 turn'), { value: 1, units: 'turns' });
        assert.deepEqual(parseItemDuration('10 rounds'), { value: 10, units: 'rounds' });
    });

    test('maps scene / encounter / end-of-combat wording to the combatEnd expiry', () => {
        for (const text of ['Scene', 'scene', 'Encounter', 'End of combat', 'Until end of combat', '1 scene']) {
            assert.deepEqual(parseItemDuration(text), { expiry: 'combatEnd' }, text);
        }
    });

    test('a number-and-unit wins over scene wording in the same text', () => {
        assert.deepEqual(parseItemDuration('2 rounds or end of combat'), { value: 2, units: 'rounds' });
    });

    test('returns null when there is no fixed length to resolve', () => {
        for (const text of ['', undefined, null, 'Permanent', 'until dawn', 'a while', '5', '12']) {
            assert.equal(parseItemDuration(text), null, String(text));
        }
    });

    test('refuses dice expressions instead of resolving only the leading digit', () => {
        assert.equal(parseItemDuration('1d6 hours'), null);
        assert.equal(parseItemDuration('2D10 minutes'), null);
        assert.equal(parseItemDuration('2 d 6 minutes'), null);
        assert.equal(parseItemDuration('1d6 rounds'), null);
    });
});

describe('buildCopiedEffectDuration', () => {
    const blank = { value: null, units: 'seconds', expiry: null, expired: false };

    test('a game-time item duration becomes a v14 real-time duration, never the legacy seconds key', () => {
        const d = buildCopiedEffectDuration(blank, { value: 7200, units: 'seconds' });
        assert.deepEqual(d, { value: 7200, units: 'seconds', expiry: null, expired: false });
        assert.equal('seconds' in d, false);
    });

    test('a rounds or turns item duration sets combat units', () => {
        assert.deepEqual(buildCopiedEffectDuration(blank, { value: 3, units: 'rounds' }), {
            value: 3,
            units: 'rounds',
            expiry: null,
            expired: false
        });
        assert.equal(buildCopiedEffectDuration(blank, { value: 2, units: 'turns' }).units, 'turns');
    });

    test('an end-of-combat item duration sets the expiry and leaves value/units alone', () => {
        assert.deepEqual(buildCopiedEffectDuration(blank, { expiry: 'combatEnd' }), {
            value: null,
            units: 'seconds',
            expiry: 'combatEnd',
            expired: false
        });
    });

    test('the item duration overrides a different unit on the source effect but keeps its expiry', () => {
        const d = buildCopiedEffectDuration(
            { value: 3, units: 'rounds', expiry: 'turnEnd', expired: false },
            { value: 60, units: 'seconds' }
        );
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
        assert.equal(buildCopiedEffectDuration(source, { value: 120, units: 'seconds' }).expired, false);
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

describe('allEffectsExpired', () => {
    const expired = { duration: { expired: true } };
    const live = { duration: { expired: false } };

    test('true only when every effect has expired', () => {
        assert.equal(allEffectsExpired([expired, expired]), true);
        assert.equal(allEffectsExpired([expired, live]), false);
        assert.equal(allEffectsExpired([live]), false);
    });

    test('an effect with no timer (permanent) keeps the group from being fully expired', () => {
        assert.equal(allEffectsExpired([expired, {}]), false);
        assert.equal(allEffectsExpired([expired, { duration: {} }]), false);
    });

    test('empty or missing lists are not "all expired"', () => {
        assert.equal(allEffectsExpired([]), false);
        assert.equal(allEffectsExpired(null), false);
        assert.equal(allEffectsExpired(undefined), false);
    });

    test('accepts any iterable, such as a Foundry Collection', () => {
        assert.equal(allEffectsExpired(new Set([expired])), true);
    });
});

describe('isTimeBasedDuration / effectiveExpiry', () => {
    test('seconds through years run on the clock; rounds and turns do not', () => {
        for (const units of ['seconds', 'minutes', 'hours', 'days', 'months', 'years']) {
            assert.equal(isTimeBasedDuration({ units }), true, units);
        }
        for (const units of ['rounds', 'turns', undefined, 'fortnights']) {
            assert.equal(isTimeBasedDuration({ units }), false, String(units));
        }
        assert.equal(isTimeBasedDuration(null), false);
    });

    test('the schema-default turnStart means no event for a time-based duration only', () => {
        assert.equal(effectiveExpiry({ units: 'hours', expiry: 'turnStart' }), null);
        assert.equal(effectiveExpiry({ units: 'rounds', expiry: 'turnStart' }), 'turnStart');
        assert.equal(effectiveExpiry({ units: 'hours', expiry: 'turnEnd' }), 'turnEnd');
        assert.equal(effectiveExpiry({ units: 'hours', expiry: 'combatEnd' }), 'combatEnd');
        assert.equal(effectiveExpiry({ units: 'hours', expiry: '' }), null);
        assert.equal(effectiveExpiry({ units: 'hours', expiry: null }), null);
        assert.equal(effectiveExpiry(undefined), null);
    });
});

describe('isTimeDurationOverdue / selectOverdueEffects', () => {
    const base = { units: 'hours', value: 1, expired: false, expiry: null };
    const overdue = { duration: { ...base, remaining: -7 } };

    test('a clock-based effect past its length is overdue, including with the default turnStart', () => {
        assert.equal(isTimeDurationOverdue(overdue), true);
        assert.equal(isTimeDurationOverdue({ duration: { ...base, remaining: 0 } }), true);
        assert.equal(isTimeDurationOverdue({ duration: { ...base, expiry: 'turnStart', remaining: -7 } }), true);
    });

    test('time still left, an infinite or missing remaining, or no duration is never overdue', () => {
        assert.equal(isTimeDurationOverdue({ duration: { ...base, remaining: 1 } }), false);
        assert.equal(isTimeDurationOverdue({ duration: { ...base, remaining: Infinity } }), false);
        assert.equal(isTimeDurationOverdue({ duration: { ...base, remaining: null } }), false);
        assert.equal(isTimeDurationOverdue({ duration: { ...base, remaining: NaN } }), false);
        assert.equal(isTimeDurationOverdue({}), false);
        assert.equal(isTimeDurationOverdue(undefined), false);
    });

    test('combat-based durations and effects waiting on an explicit event are left to core', () => {
        assert.equal(isTimeDurationOverdue({ duration: { units: 'rounds', value: 3, remaining: -2 } }), false);
        assert.equal(isTimeDurationOverdue({ duration: { ...base, expiry: 'turnEnd', remaining: -7 } }), false);
        assert.equal(isTimeDurationOverdue({ duration: { ...base, expiry: 'combatEnd', remaining: -7 } }), false);
    });

    test('selectOverdueEffects skips effects already marked expired and keeps only overdue ones', () => {
        const alreadyExpired = { duration: { ...base, expired: true, remaining: -7 } };
        const live = { duration: { ...base, remaining: 5 } };
        assert.deepEqual(selectOverdueEffects([overdue, alreadyExpired, live]), [overdue]);
        assert.deepEqual(selectOverdueEffects(null), []);
        assert.deepEqual(selectOverdueEffects(new Set([overdue])), [overdue]);
    });

    test('isEffectActive treats an overdue effect as inactive even before expiry is recorded', () => {
        assert.equal(isEffectActive(overdue), false);
        assert.equal(isEffectActive({ duration: { ...base, remaining: 5 } }), true);
        assert.equal(isEffectActive({ duration: { units: 'rounds', remaining: -1 } }), true);
    });

    test('an overdue effect no longer adds its bonus to the stat math', () => {
        const change = { key: 'system.stats.str.bonus', type: 'add', value: 2 };
        const effect = { changes: [change], duration: { ...base, remaining: -7 } };
        assert.equal(computeActiveEffectFieldValue([effect], ['system.stats.str.bonus'], 3), 3);
    });
});

describe('buildCopiedEffectDuration default expiry', () => {
    test('a copied clock-based duration drops the schema-default turnStart', () => {
        const d = buildCopiedEffectDuration({ value: 1, units: 'hours', expiry: 'turnStart', expired: false }, null);
        assert.equal(d.expiry, null);
        const text = buildCopiedEffectDuration(
            { value: null, units: 'seconds', expiry: 'turnStart' },
            { value: 60, units: 'seconds' }
        );
        assert.equal(text.expiry, null);
    });

    test('rounds keep turnStart, and explicit other events are kept', () => {
        assert.equal(
            buildCopiedEffectDuration({ value: 3, units: 'rounds', expiry: 'turnStart' }, null).expiry,
            'turnStart'
        );
        assert.equal(
            buildCopiedEffectDuration({ value: 1, units: 'hours', expiry: 'turnEnd' }, null).expiry,
            'turnEnd'
        );
        assert.equal(
            buildCopiedEffectDuration({ value: 1, units: 'hours', expiry: 'combatEnd' }, null).expiry,
            'combatEnd'
        );
    });

    test('a copy with no expiry key does not gain one', () => {
        assert.equal('expiry' in buildCopiedEffectDuration({ value: 60, units: 'seconds' }, null), false);
    });
});

describe('selectRevivedEffects', () => {
    const timed = (stored, remaining, units = 'hours') => ({
        _source: { duration: { expired: stored } },
        duration: { units, remaining, expired: false }
    });

    test('an effect recorded as expired with time left again is revived', () => {
        const back = timed(true, 1800);
        assert.deepEqual(selectRevivedEffects([back]), [back]);
    });

    test('still overdue, never expired, or not clock-based is left alone', () => {
        assert.deepEqual(
            selectRevivedEffects([timed(true, -5), timed(true, 0), timed(false, 1800), timed(true, 1800, 'rounds')]),
            []
        );
        assert.deepEqual(selectRevivedEffects([timed(true, Infinity), timed(true, null), timed(true, NaN)]), []);
    });

    test('reads the stored flag, falling back to the prepared one for plain objects', () => {
        const plain = { duration: { units: 'hours', remaining: 60, expired: true } };
        assert.deepEqual(selectRevivedEffects([plain]), [plain]);
        assert.deepEqual(selectRevivedEffects(null), []);
    });
});

describe('formatEffectDuration / describeDrugDuration', () => {
    test('formats rounds, turns and clock durations readably', () => {
        assert.equal(formatEffectDuration({ value: 3, units: 'rounds' }), '3 rounds');
        assert.equal(formatEffectDuration({ value: 1, units: 'turns' }), '1 turn');
        assert.equal(formatEffectDuration({ value: 7200, units: 'seconds' }), '2 hours');
        assert.equal(formatEffectDuration({ value: 90, units: 'seconds' }), '90 seconds');
        assert.equal(formatEffectDuration({ value: 1, units: 'hours' }), '1 hour');
    });

    test('has no label for an effect without a finite length', () => {
        assert.equal(formatEffectDuration({ value: null, units: 'rounds' }), null);
        assert.equal(formatEffectDuration({ value: 0, units: 'rounds' }), null);
        assert.equal(formatEffectDuration({ value: 3, units: 'bogus' }), null);
        assert.equal(formatEffectDuration(undefined), null);
    });

    test('the drug card prefers the item text, then the effect Duration tab, then Unknown', () => {
        const effects = [{ duration: { value: null } }, { duration: { value: 3, units: 'rounds' } }];
        assert.equal(describeDrugDuration('2 hours', effects), '2 hours');
        assert.equal(describeDrugDuration('  ', effects), '3 rounds');
        const prepared = {
            duration: { value: 18, units: 'seconds' },
            _source: { duration: { value: 3, units: 'rounds' } }
        };
        assert.equal(describeDrugDuration('', [prepared]), '3 rounds');
        assert.equal(describeDrugDuration('', []), 'Unknown');
        assert.equal(describeDrugDuration(undefined, undefined), 'Unknown');
    });
});
