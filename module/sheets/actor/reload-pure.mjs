/**
 * Pure reload helpers (no Foundry runtime dependencies — unit tested).
 *
 * reload.mjs wraps these with document updates for live use.
 */

const DEFAULT_CLIP_CAPACITY = 10;

/**
 * The clip size a weapon currently holds at most: the loaded clip's size when a reload recorded one,
 * otherwise the weapon's own (book) clip size.
 *
 * @param {{ loadedCapacity?: number, maxAmmo?: number }} [weaponSystem] - the weapon's `system` data
 * @returns {number}
 */
export function resolveClipCapacity(weaponSystem) {
    return weaponSystem?.loadedCapacity || weaponSystem?.maxAmmo || 0;
}

/**
 * Rounds a reload loads: the clip's own capacity (an override for odd-size clips), else the
 * weapon's clip size, else a 10-round default.
 *
 * @param {{ ammoCapacity?: number }} [magazineSystem] - the clip item's `system` data
 * @param {{ maxAmmo?: number }} [weaponSystem] - the weapon's `system` data
 * @returns {number}
 */
export function resolveReloadCapacity(magazineSystem, weaponSystem) {
    return magazineSystem?.ammoCapacity || weaponSystem?.maxAmmo || DEFAULT_CLIP_CAPACITY;
}

/**
 * Builds the weapon update payload for a reload, snapshotting the clip's ammo type onto the weapon
 * (rather than a live reference — clips are frequently deleted immediately after the reload that
 * consumes them). The weapon's configured clip size (`maxAmmo`) is never touched; the size of the
 * clip just loaded goes in `loadedCapacity`.
 *
 * @param {{ ammoCapacity?: number, ammoType?: string }} magazineSystem - the clip item's `system` data
 * @param {{ maxAmmo?: number }} [weaponSystem] - the weapon's `system` data
 * @returns {{ 'system.ammo': number, 'system.loadedCapacity': number, 'system.ammoType': string }}
 */
export function buildReloadWeaponUpdate(magazineSystem, weaponSystem) {
    const capacity = resolveReloadCapacity(magazineSystem, weaponSystem);
    return {
        'system.ammo': capacity,
        'system.loadedCapacity': capacity,
        'system.ammoType': magazineSystem?.ammoType || 'standard'
    };
}
