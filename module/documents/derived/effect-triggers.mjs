/**
 * Pure item→actor Active Effect trigger rules (no document runtime). See
 * .docs/EFFECT_TRIGGERS_DESIGN.md.
 *
 * An item's embedded effects are copied onto its actor by explicit events (equip, drug toggle,
 * trait grant, ...), never by Foundry's native `effect.transfer`. This module is the single table
 * of which effect applies on, and is removed by, which event. Stage 1: nothing calls it yet; the
 * golden test (`tests/unit/derived-effect-triggers.test.mjs`) pins today's per-type behaviour so
 * later stages can route the existing call sites through it without changing anything.
 */

/** The closed set of per-effect trigger kinds. */
export const APPLY_ON_VALUES = Object.freeze(['equipped', 'owned', 'active', 'manual']);

/**
 * Trigger kind each item type's effects use when the effect carries no explicit `applyOn`.
 * Types absent here (explosive, magazine, species, ...) never copy effects to an actor.
 */
export const DEFAULT_APPLY_ON = Object.freeze({
    item: 'equipped',
    weapon: 'equipped',
    armor: 'equipped',
    trait: 'owned',
    drug: 'active',
    toxicant: 'manual',
    ebbFormula: 'manual'
});

/**
 * What each event does. `applies`/`removes` name the `applyOn` kinds the event copies onto, or
 * removes from, the actor. Delete removes `equipped` and `owned` copies but deliberately not
 * `active` or `manual` ones: using a drug's last dose deletes the item right after applying its
 * effect, and that effect has to outlive it.
 */
export const EFFECT_EVENTS = Object.freeze({
    equip: { applies: ['equipped'], removes: [] },
    unequip: { applies: [], removes: ['equipped'] },
    activate: { applies: ['active'], removes: [] },
    deactivate: { applies: [], removes: ['active'] },
    grant: { applies: ['owned'], removes: [] },
    manual: { applies: ['manual'], removes: [] },
    delete: { applies: [], removes: ['equipped', 'owned'] }
});

/**
 * The effect's trigger kind: a valid `flags['sla-industries'].applyOn` if present, otherwise the
 * item type's default, otherwise `null` (this item type never applies effects).
 * @param {{ flags?: Record<string, any> } | null | undefined} effect
 * @param {string} itemType
 * @returns {string | null}
 */
export function resolveApplyOn(effect, itemType) {
    const flagged = effect?.flags?.['sla-industries']?.applyOn;
    if (typeof flagged === 'string' && APPLY_ON_VALUES.includes(flagged)) return flagged;
    return Object.hasOwn(DEFAULT_APPLY_ON, itemType) ? DEFAULT_APPLY_ON[itemType] : null;
}

/**
 * @param {Iterable<object>} effects
 * @param {string} itemType
 * @param {string} event A key of `EFFECT_EVENTS`; unknown events match nothing.
 * @param {'applies' | 'removes'} direction
 * @returns {object[]}
 */
function matchingEffects(effects, itemType, event, direction) {
    const kinds = Object.hasOwn(EFFECT_EVENTS, event) ? EFFECT_EVENTS[event][direction] : [];
    if (!kinds.length) return [];
    return Array.from(effects ?? []).filter((e) => kinds.includes(resolveApplyOn(e, itemType)));
}

/**
 * The effects an event copies onto the actor.
 * @param {Iterable<object>} effects The item's embedded effects.
 * @param {string} itemType
 * @param {string} event
 * @returns {object[]}
 */
export function effectsToApply(effects, itemType, event) {
    return matchingEffects(effects, itemType, event, 'applies');
}

/**
 * The effects an event removes from the actor. Pass the item's embedded effects (or the actor's
 * copies, which keep the source's flags) and filter by origin separately.
 * @param {Iterable<object>} effects
 * @param {string} itemType
 * @param {string} event
 * @returns {object[]}
 */
export function effectsToRemove(effects, itemType, event) {
    return matchingEffects(effects, itemType, event, 'removes');
}

/**
 * Events fired when an item is created on an actor: always `grant`, plus `equip`/`activate` when
 * it is created already equipped or active (a macro, import, or NPC drop that skips the setters).
 * @param {{ equipped?: unknown, active?: unknown } | null | undefined} system The new item's `system` data.
 * @returns {string[]}
 */
export function eventsForItemCreate(system) {
    const events = ['grant'];
    if (system?.equipped === true) events.push('equip');
    if (system?.active === true) events.push('activate');
    return events;
}

/**
 * Events fired by an item update: `equip`/`unequip` when `system.equipped` changed and
 * `activate`/`deactivate` when `system.active` changed. Reads the expanded form
 * (`{ system: { equipped } }`) and the flat dotted key, since hooks can receive either.
 * @param {object | null | undefined} changes The update's changed data.
 * @returns {string[]}
 */
export function eventsForItemUpdate(changes) {
    const read = (field) => changes?.system?.[field] ?? changes?.[`system.${field}`];
    const events = [];
    const equipped = read('equipped');
    if (typeof equipped === 'boolean') events.push(equipped ? 'equip' : 'unequip');
    const active = read('active');
    if (typeof active === 'boolean') events.push(active ? 'activate' : 'deactivate');
    return events;
}

/**
 * The `applyOn` kinds that have a real trigger for each item type, default first. A selector must
 * only offer these: `equipped` needs the equip toggle (item/weapon/armor only), `active` needs the
 * drug Active toggle, `manual` needs code that applies it (the infection test, the Ebb apply button),
 * while `owned` works for any type because the actor's create/delete hooks fire for every item.
 * Toxicants are `manual` only on purpose: applying one on ownership would skip its infection test.
 */
export const APPLY_ON_CHOICES = Object.freeze({
    item: Object.freeze(['equipped', 'owned']),
    weapon: Object.freeze(['equipped', 'owned']),
    armor: Object.freeze(['equipped', 'owned']),
    trait: Object.freeze(['owned']),
    drug: Object.freeze(['active', 'owned']),
    toxicant: Object.freeze(['manual']),
    ebbFormula: Object.freeze(['manual', 'owned'])
});

/** The flag an effect stores its explicit trigger kind under: `flags['sla-industries'].applyOn`. */
export const APPLY_ON_FLAG_SCOPE = 'sla-industries';
export const APPLY_ON_FLAG_KEY = 'applyOn';

/**
 * What the item sheet's per-effect trigger selector should show, or `null` when the type has only
 * one trigger (nothing for the GM to choose, so no control).
 * @param {{ flags?: Record<string, any> } | null | undefined} effect
 * @param {string} itemType
 * @returns {{ defaultValue: string, current: string, values: string[] } | null}
 *   `current` is the stored kind ('' when the effect uses the type default); `values` lists every
 *   kind to offer besides "default", with a stored kind appended when it is no longer offered for
 *   this type so the control never hides what is actually set.
 */
export function buildApplyOnSelect(effect, itemType) {
    const choices = Object.hasOwn(APPLY_ON_CHOICES, itemType) ? APPLY_ON_CHOICES[itemType] : [];
    if (choices.length < 2) return null;
    const stored = effect?.flags?.[APPLY_ON_FLAG_SCOPE]?.[APPLY_ON_FLAG_KEY];
    const current = typeof stored === 'string' && APPLY_ON_VALUES.includes(stored) ? stored : '';
    const values = [...choices];
    if (current && !values.includes(current)) values.push(current);
    return { defaultValue: DEFAULT_APPLY_ON[itemType], current, values };
}
