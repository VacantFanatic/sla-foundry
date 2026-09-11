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
 * Resolves the ammo type key snapshotted onto the weapon at its last reload
 * (see reload-pure.mjs::buildReloadWeaponUpdate). Returns null for a weapon
 * that has never been reloaded (melee weapons, or a fresh ranged weapon).
 *
 * @param {{ system?: { ammoType?: string } }} item
 * @returns {string|null}
 */
function resolveLoadedAmmoType(item) {
    return item?.system?.ammoType || null;
}

/**
 * Looks up the ammo modifier entry for the weapon's currently loaded ammo type.
 * Returns null when the weapon has never been reloaded or the ammo type has no
 * configured modifier.
 *
 * @param {{ system?: { ammoType?: string } }} item
 * @param {Record<string, { damage?: number, ad?: number, pv?: number }>} ammoModifiers - Caller injects CONFIG.SLA.ammoModifiers
 * @returns {{ damage?: number, ad?: number, pv?: number }|null}
 */
function resolveLoadedAmmoModifiers(item, ammoModifiers) {
    const ammoType = resolveLoadedAmmoType(item);
    if (ammoType === null) return null;
    return ammoModifiers?.[ammoType] ?? null;
}

/**
 * Returns the flat damage modifier from the weapon's loaded ammo type (e.g. HE +1).
 * @returns {number}
 */
export function getAmmoDamageModifierForWeapon(item, ammoModifiers) {
    const mods = resolveLoadedAmmoModifiers(item, ammoModifiers);
    return mods ? Number(mods.damage) || 0 : 0;
}

/**
 * Returns the AD (Armour Damage) modifier from the weapon's loaded ammo type
 * (e.g. HE +1, Shotgun Slug -1).
 * @returns {number}
 */
export function getAmmoAdModifierForWeapon(item, ammoModifiers) {
    const mods = resolveLoadedAmmoModifiers(item, ammoModifiers);
    return mods ? Number(mods.ad) || 0 : 0;
}

/**
 * Returns the target-armour PV modifier from the weapon's loaded ammo type
 * (e.g. AP -2). Applied at damage resolution, not pre-roll.
 * @returns {number}
 */
export function getAmmoPvModifierForWeapon(item, ammoModifiers) {
    const mods = resolveLoadedAmmoModifiers(item, ammoModifiers);
    return mods ? Number(mods.pv) || 0 : 0;
}

/**
 * Returns the display name of the weapon's loaded ammo type (e.g. "Armour Piercing (AP)").
 * Returns null when the weapon has never been reloaded or the ammo type has no
 * configured display name.
 *
 * @param {{ system?: { ammoType?: string } }} item
 * @param {Record<string, string>} ammoTypes - Caller injects CONFIG.SLA.ammoTypes
 * @returns {string|null}
 */
export function getLoadedAmmoNameForWeapon(item, ammoTypes) {
    const ammoType = resolveLoadedAmmoType(item);
    if (ammoType === null) return null;
    return ammoTypes?.[ammoType] ?? null;
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
