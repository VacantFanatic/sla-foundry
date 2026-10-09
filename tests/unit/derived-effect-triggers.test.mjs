/**
 * Golden test for the item→actor effect trigger table (no Foundry runtime).
 *
 * `GOLDEN` is a hand-written record of what the shipped code does today, per item type, taken from
 * the call sites rather than from `effect-triggers.mjs`: `SlaItem#setEquipped` (item/weapon/armor),
 * `SlaItem#toggleActive` and `item-use-drug` (drug), `SlaActor` create/delete descendant hooks
 * (trait; delete also cleans item/weapon/armor), `SlaItem#rollInfectionTest` (toxicant) and
 * `onApplyEbbEffects` (ebbFormula). Stage 2 routes those call sites through the table; this test is
 * what proves they don't change behaviour when it does.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
    APPLY_ON_VALUES,
    DEFAULT_APPLY_ON,
    EFFECT_EVENTS,
    resolveApplyOn,
    effectsToApply,
    effectsToRemove,
    eventsForItemCreate,
    eventsForItemUpdate,
    APPLY_ON_CHOICES,
    buildApplyOnSelect
} from '../../module/documents/derived/effect-triggers.mjs';

const EVENTS = Object.keys(EFFECT_EVENTS);

/** type -> { event: ['applies' | 'removes' ...] } — events not listed do nothing for that type. */
const GOLDEN = {
    item: { equip: 'applies', unequip: 'removes', delete: 'removes' },
    weapon: { equip: 'applies', unequip: 'removes', delete: 'removes' },
    armor: { equip: 'applies', unequip: 'removes', delete: 'removes' },
    trait: { grant: 'applies', delete: 'removes' },
    drug: { activate: 'applies', deactivate: 'removes' },
    toxicant: { manual: 'applies' },
    ebbFormula: { manual: 'applies' },
    // Types that never copy effects to an actor.
    explosive: {},
    magazine: {},
    species: {},
    package: {},
    skill: {},
    discipline: {},
    blueprintNews: {}
};

const plainEffect = { name: 'E', flags: {} };

describe('default trigger table (golden)', () => {
    for (const [type, expected] of Object.entries(GOLDEN)) {
        test(`${type}: every event does exactly what ships today`, () => {
            for (const event of EVENTS) {
                const applied = effectsToApply([plainEffect], type, event).length;
                const removed = effectsToRemove([plainEffect], type, event).length;
                assert.equal(applied, expected[event] === 'applies' ? 1 : 0, `${type} ${event} applies`);
                assert.equal(removed, expected[event] === 'removes' ? 1 : 0, `${type} ${event} removes`);
            }
        });
    }

    test('DEFAULT_APPLY_ON names only valid kinds and exactly the types that apply effects', () => {
        for (const kind of Object.values(DEFAULT_APPLY_ON)) assert.ok(APPLY_ON_VALUES.includes(kind));
        const typesThatApply = Object.entries(GOLDEN)
            .filter(([, events]) => Object.values(events).includes('applies'))
            .map(([type]) => type)
            .sort();
        assert.deepEqual(Object.keys(DEFAULT_APPLY_ON).sort(), typesThatApply);
    });

    test('deleting a drug or a manual-effect item never removes its copied effect', () => {
        for (const type of ['drug', 'toxicant', 'ebbFormula']) {
            assert.deepEqual(effectsToRemove([plainEffect], type, 'delete'), []);
        }
    });
});

describe('resolveApplyOn', () => {
    test('falls back to the type default, then to null', () => {
        assert.equal(resolveApplyOn(plainEffect, 'weapon'), 'equipped');
        assert.equal(resolveApplyOn(plainEffect, 'explosive'), null);
        assert.equal(resolveApplyOn(undefined, 'trait'), 'owned');
        assert.equal(resolveApplyOn(null, 'nonsense'), null);
    });

    test('honours a valid flag on the effect', () => {
        const flagged = { flags: { 'sla-industries': { applyOn: 'manual' } } };
        assert.equal(resolveApplyOn(flagged, 'weapon'), 'manual');
        assert.equal(resolveApplyOn(flagged, 'explosive'), 'manual');
    });

    test('ignores an invalid flag value and reads only the system namespace', () => {
        assert.equal(resolveApplyOn({ flags: { 'sla-industries': { applyOn: 'whenever' } } }, 'drug'), 'active');
        assert.equal(resolveApplyOn({ flags: { 'sla-industries': { applyOn: 7 } } }, 'drug'), 'active');
        assert.equal(resolveApplyOn({ flags: { sla: { applyOn: 'manual' } } }, 'drug'), 'active');
    });
});

describe('effectsToApply / effectsToRemove on a mixed item', () => {
    const live = { name: 'while equipped', flags: {} };
    const onHit = { name: 'on hit', flags: { 'sla-industries': { applyOn: 'manual' } } };
    const always = { name: 'always on', flags: { 'sla-industries': { applyOn: 'owned' } } };
    const effects = [live, onHit, always];

    test('each event picks only its own kind', () => {
        assert.deepEqual(effectsToApply(effects, 'weapon', 'equip'), [live]);
        assert.deepEqual(effectsToApply(effects, 'weapon', 'manual'), [onHit]);
        assert.deepEqual(effectsToApply(effects, 'weapon', 'grant'), [always]);
        assert.deepEqual(effectsToRemove(effects, 'weapon', 'unequip'), [live]);
    });

    test('delete removes equipped and owned copies but not manual ones', () => {
        assert.deepEqual(effectsToRemove(effects, 'weapon', 'delete'), [live, always]);
    });
});

describe('robustness', () => {
    test('unknown events and missing effect lists match nothing', () => {
        assert.deepEqual(effectsToApply([plainEffect], 'weapon', 'explode'), []);
        assert.deepEqual(effectsToRemove([plainEffect], 'weapon', 'toString'), []);
        assert.deepEqual(effectsToApply(undefined, 'weapon', 'equip'), []);
        assert.deepEqual(effectsToRemove(null, 'weapon', 'unequip'), []);
    });

    test('accepts any iterable, such as a Foundry Collection of effects', () => {
        const collection = new Map([['a', plainEffect]]).values();
        assert.deepEqual(effectsToApply(collection, 'item', 'equip'), [plainEffect]);
    });
});

describe('eventsForItemCreate', () => {
    test('always grants, and also equips/activates an item created already in that state', () => {
        assert.deepEqual(eventsForItemCreate({}), ['grant']);
        assert.deepEqual(eventsForItemCreate(undefined), ['grant']);
        assert.deepEqual(eventsForItemCreate({ equipped: false, active: false }), ['grant']);
        assert.deepEqual(eventsForItemCreate({ equipped: true }), ['grant', 'equip']);
        assert.deepEqual(eventsForItemCreate({ active: true }), ['grant', 'activate']);
        assert.deepEqual(eventsForItemCreate({ equipped: true, active: true }), ['grant', 'equip', 'activate']);
    });
});

describe('eventsForItemUpdate', () => {
    test('maps equipped/active changes to events in both change shapes', () => {
        assert.deepEqual(eventsForItemUpdate({ system: { equipped: true } }), ['equip']);
        assert.deepEqual(eventsForItemUpdate({ system: { equipped: false } }), ['unequip']);
        assert.deepEqual(eventsForItemUpdate({ 'system.equipped': true }), ['equip']);
        assert.deepEqual(eventsForItemUpdate({ system: { active: true } }), ['activate']);
        assert.deepEqual(eventsForItemUpdate({ 'system.active': false }), ['deactivate']);
    });

    test('ignores unrelated changes and non-boolean values', () => {
        assert.deepEqual(eventsForItemUpdate({ name: 'x', system: { quantity: 2 } }), []);
        assert.deepEqual(eventsForItemUpdate({ system: { equipped: 'yes' } }), []);
        assert.deepEqual(eventsForItemUpdate(undefined), []);
    });
});

describe('APPLY_ON_CHOICES', () => {
    test('every type offers its own default first, and only valid kinds', () => {
        for (const [type, choices] of Object.entries(APPLY_ON_CHOICES)) {
            assert.equal(choices[0], DEFAULT_APPLY_ON[type], `${type} default is first`);
            for (const kind of choices) assert.ok(APPLY_ON_VALUES.includes(kind), `${type} ${kind}`);
        }
        assert.deepEqual(Object.keys(APPLY_ON_CHOICES).sort(), Object.keys(DEFAULT_APPLY_ON).sort());
    });

    test('only offers kinds with a real trigger for the type', () => {
        // `equipped` needs the equip toggle; `active` needs the drug toggle; `manual` needs code that applies it.
        for (const type of Object.keys(APPLY_ON_CHOICES)) {
            const kinds = APPLY_ON_CHOICES[type];
            assert.equal(kinds.includes('equipped'), ['item', 'weapon', 'armor'].includes(type), `${type} equipped`);
            assert.equal(kinds.includes('active'), type === 'drug', `${type} active`);
            assert.equal(kinds.includes('manual'), ['toxicant', 'ebbFormula'].includes(type), `${type} manual`);
            assert.equal(kinds.includes('owned'), type !== 'toxicant', `${type} owned`);
        }
    });

    test('every offered kind actually changes behaviour for that type (no inert choices)', () => {
        for (const [type, kinds] of Object.entries(APPLY_ON_CHOICES)) {
            for (const kind of kinds) {
                const effect = { flags: { 'sla-industries': { applyOn: kind } } };
                const events = Object.keys(EFFECT_EVENTS).filter(
                    (e) => effectsToApply([effect], type, e).length || effectsToRemove([effect], type, e).length
                );
                assert.ok(events.length > 0, `${type}/${kind} reacts to at least one event`);
            }
        }
    });
});

describe('buildApplyOnSelect', () => {
    const plain = { flags: {} };

    test('is null for a single-trigger type, so no pointless control is drawn', () => {
        assert.equal(buildApplyOnSelect(plain, 'trait'), null);
        assert.equal(buildApplyOnSelect(plain, 'toxicant'), null);
        assert.equal(buildApplyOnSelect(plain, 'explosive'), null);
        assert.equal(buildApplyOnSelect(plain, 'nonsense'), null);
    });

    test('offers the type choices with the default marked and no explicit value set', () => {
        assert.deepEqual(buildApplyOnSelect(plain, 'weapon'), {
            defaultValue: 'equipped',
            current: '',
            values: ['equipped', 'owned']
        });
        assert.deepEqual(buildApplyOnSelect(undefined, 'ebbFormula'), {
            defaultValue: 'manual',
            current: '',
            values: ['manual', 'owned']
        });
    });

    test('reports the stored kind, and keeps a stored kind that is no longer offered visible', () => {
        const owned = { flags: { 'sla-industries': { applyOn: 'owned' } } };
        assert.equal(buildApplyOnSelect(owned, 'armor').current, 'owned');
        const odd = { flags: { 'sla-industries': { applyOn: 'active' } } };
        assert.deepEqual(buildApplyOnSelect(odd, 'weapon').values, ['equipped', 'owned', 'active']);
    });

    test('ignores an invalid stored value', () => {
        const bad = { flags: { 'sla-industries': { applyOn: 'whenever' } } };
        assert.equal(buildApplyOnSelect(bad, 'drug').current, '');
    });
});
