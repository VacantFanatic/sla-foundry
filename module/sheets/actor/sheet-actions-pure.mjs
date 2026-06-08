/**
 * Pure helpers for actor sheet UI actions (unit tested).
 */

export const SPECIES_REMOVAL_STAT_KEYS = ['str', 'dex', 'know', 'conc', 'cha', 'cool'];

/**
 * Actor updates applied when removing a species chip from the sheet.
 */
export function buildSpeciesRemovalUpdates() {
    const updates = { 'system.bio.species': '' };
    for (const key of SPECIES_REMOVAL_STAT_KEYS) {
        updates[`system.stats.${key}.value`] = 1;
    }
    return updates;
}
