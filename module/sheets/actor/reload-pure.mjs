/**
 * Pure reload helpers (no Foundry runtime dependencies — unit tested).
 *
 * reload.mjs wraps these with document updates for live use.
 */

/**
 * Builds the weapon update payload for a reload, snapshotting the magazine's
 * ammo type onto the weapon (rather than a live reference — magazines are
 * frequently deleted immediately after the reload that consumes them).
 *
 * @param {{ ammoCapacity?: number, ammoType?: string }} magazineSystem - the magazine's `system` data
 * @returns {{ 'system.ammo': number, 'system.maxAmmo': number, 'system.ammoType': string }}
 */
export function buildReloadWeaponUpdate(magazineSystem) {
    const capacity = magazineSystem?.ammoCapacity || 10;
    return {
        'system.ammo': capacity,
        'system.maxAmmo': capacity,
        'system.ammoType': magazineSystem?.ammoType || 'standard'
    };
}
