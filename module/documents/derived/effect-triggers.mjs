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
