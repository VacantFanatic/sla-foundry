import { NATURAL_WEAPONS } from '../../data/natural-weapons.mjs';

/**
 * Which natural weapon (if any) a species grants on add/removes on remove.
 * @param {string} speciesNameLower - already-lowercased species item name
 * @returns {typeof NATURAL_WEAPONS.teethClaws | typeof NATURAL_WEAPONS.beak | null}
 */
export function resolveNaturalWeaponForSpecies(speciesNameLower) {
    if (speciesNameLower.includes('stormer')) return NATURAL_WEAPONS.teethClaws;
    if (speciesNameLower.includes('neophron')) return NATURAL_WEAPONS.beak;
    return null;
}

/**
 * Known-species stat defaults, applied when a Species item looks unmigrated/blank (see
 * handleSpeciesAdd's isBlank check). Only returns the fields that species branch actually sets;
 * callers fall back to the item's own (already-zero, since isBlank required it) value for any
 * field left out.
 * @param {string} speciesNameLower - already-lowercased species item name
 * @returns {{luckInit?: number, luckMax?: number, fluxInit?: number, fluxMax?: number, hpBase?: number, moveClosing?: number, moveRushing?: number} | null}
 */
export function resolveSpeciesDefaults(speciesNameLower) {
    if (speciesNameLower.includes('ebon')) {
        return { fluxInit: 2, fluxMax: 6, hpBase: 14, moveClosing: 2, moveRushing: 5 };
    }
    if (speciesNameLower.includes('human')) {
        return { luckInit: 1, luckMax: 6, hpBase: 14, moveClosing: 2, moveRushing: 5 };
    }
    if (speciesNameLower.includes('frother')) {
        return { luckInit: 1, luckMax: 3, hpBase: 15, moveClosing: 2, moveRushing: 5 };
    }
    if (speciesNameLower.includes('wraithen')) {
        return { luckInit: 1, luckMax: 4, hpBase: 14, moveClosing: 4, moveRushing: 8 };
    }
    if (speciesNameLower.includes('shaktar')) {
        return { luckInit: 0, luckMax: 3, hpBase: 19, moveClosing: 3, moveRushing: 6 };
    }
    if (speciesNameLower.includes('carrien')) {
        // Advanced Carrien
        return { luckInit: 0, luckMax: 3, hpBase: 20, moveClosing: 4, moveRushing: 7 };
    }
    if (speciesNameLower.includes('neophron')) {
        return { luckInit: 0, luckMax: 3, hpBase: 11, moveClosing: 2, moveRushing: 5 };
    }
    if (speciesNameLower.includes('stormer')) {
        if (speciesNameLower.includes('313') || speciesNameLower.includes('malice')) {
            return { luckInit: 0, luckMax: 2, hpBase: 22, moveClosing: 3, moveRushing: 6 };
        }
        if (speciesNameLower.includes('711') || speciesNameLower.includes('xeno')) {
            return { luckInit: 0, luckMax: 2, hpBase: 20, moveClosing: 4, moveRushing: 6 };
        }
        return { luckInit: 0, luckMax: 2, hpBase: 20, moveClosing: 3, moveRushing: 6 };
    }
    return null;
}
