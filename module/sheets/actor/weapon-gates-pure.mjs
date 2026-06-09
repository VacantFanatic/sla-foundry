/**
 * Pure weapon gate helpers (no Foundry runtime dependencies — unit tested).
 *
 * weapon-gates.mjs wraps these with CONFIG/game injections for live use.
 */

/**
 * Characters must have a weapon equipped before attacking; NPCs and vehicles may attack freely.
 * @param {{ type: string }} actor
 * @returns {boolean}
 */
export function requiresWeaponEquippedForAttack(actor) {
    return actor.type === 'character';
}

/**
 * Returns the flat damage modifier from the loaded magazine's ammo type.
 * Returns 0 when the weapon has no magazine, the magazine is not found, or the ammo
 * type has no configured modifier.
 *
 * @param {{ items: { get: (id: string) => object|null } }|null} actor
 * @param {{ system?: { magazineId?: string } }} item
 * @param {Record<string, { damage?: number }>} ammoModifiers - Caller injects CONFIG.SLA.ammoModifiers
 * @returns {number}
 */
export function getAmmoDamageModifierForWeapon(actor, item, ammoModifiers) {
    if (!item?.system?.magazineId || !actor) return 0;
    const magazine = actor.items.get(item.system.magazineId);
    if (!magazine) return 0;
    const ammoType = magazine.system.ammoType || 'standard';
    const configMods = ammoModifiers?.[ammoType];
    return configMods ? Number(configMods.damage) || 0 : 0;
}

/**
 * Resolves the AD (Armour Damage) value for a weapon damage roll.
 * Powersuit weapons compute AD from actor STR minus a threshold; regular weapons use item.system.ad.
 *
 * @param {{ system: { stats: { str: { total?: number, value?: number } } } }} actor
 * @param {{ system: { ad?: number, powersuitAttack?: boolean, adFromStrMinus?: number } }} item
 * @returns {number}
 */
export function resolveWeaponAdForDamageRoll(actor, item) {
    let adValue = Number(item.system.ad) || 0;
    if (item.system.powersuitAttack) {
        const strValue = Number(actor.system.stats.str?.total ?? actor.system.stats.str?.value ?? 0);
        const adFromStrMinus = Number(item.system.adFromStrMinus) || 0;
        if (adFromStrMinus > 0) {
            adValue = Math.max(0, strValue - adFromStrMinus);
        }
    }
    return adValue;
}
