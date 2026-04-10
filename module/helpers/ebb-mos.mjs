import { normalizeEbbEffect } from "./items.mjs";

/**
 * MOS damage increment for Ebb attack formulas only (+1 / +2 / +4 at 2 / 3 / 4+ skill successes).
 * Heal and effect formulas do not add this bonus (rulebook: extra damage applies to Ebb attacks).
 *
 * @param {boolean} isSuccessful
 * @param {number} skillSuccessCount
 * @param {string|undefined|null} ebbEffectRaw
 * @returns {number}
 */
export function getEbbMosDamageBonus(isSuccessful, skillSuccessCount, ebbEffectRaw) {
    if (!isSuccessful) return 0;
    if (normalizeEbbEffect(ebbEffectRaw) !== "damage") return 0;
    const n = Math.max(0, Math.floor(Number(skillSuccessCount) || 0));
    if (n >= 4) return 4;
    if (n === 3) return 2;
    if (n === 2) return 1;
    return 0;
}
