/** @module helpers/toxicant-scope */

const FLAG_SCOPE = "sla-industries";
const FLAG_KEY = "toxicantImmunity";

/**
 * Active combat uses combat id; otherwise current scene id (exploration).
 * @returns {string}
 */
export function getSlaEncounterScopeId() {
    if (game.combat?.started && game.combat?.id) return `combat:${game.combat.id}`;
    const sid = game.scenes?.current?.id ?? game.scenes?.active?.id ?? "none";
    return `scene:${sid}`;
}

/**
 * @param {Actor} actor
 * @param {string} itemUuid Item.uuid of the toxicant
 */
export function isToxicantImmuneThisEncounter(actor, itemUuid) {
    const map = actor.getFlag(FLAG_SCOPE, FLAG_KEY);
    if (!map || typeof map !== "object") return false;
    return map[itemUuid] === getSlaEncounterScopeId();
}

/**
 * @param {Actor} actor
 * @param {string} itemUuid
 */
export async function setToxicantImmunityThisEncounter(actor, itemUuid) {
    const map = { ...(actor.getFlag(FLAG_SCOPE, FLAG_KEY) ?? {}) };
    map[itemUuid] = getSlaEncounterScopeId();
    await actor.setFlag(FLAG_SCOPE, FLAG_KEY, map);
}

/**
 * Reserved for future pruning of stale flag entries.
 */
export function registerToxicantImmunityHooks() {
    /* Scope id is re-evaluated each test; flags for other scopes are ignored. */
}
