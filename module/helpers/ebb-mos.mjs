import { normalizeEbbEffect } from './items.mjs';

/**
 * MOS damage increment for Ebb attack formulas only (+1 damage at exactly 2 skill successes).
 * Heal and effect formulas do not add this bonus (rulebook: extra damage applies to Ebb attacks).
 * 3 and 4+ skill successes grant a different, exclusive reward instead of more damage (reuse the
 * same ability within 5 minutes, and regain 1 FLUX respectively) — the rulebook table grants one
 * reward per tier, not a stacking/escalating one, so those tiers add no damage bonus here.
 *
 * @param {boolean} isSuccessful
 * @param {number} skillSuccessCount
 * @param {string|undefined|null} ebbEffectRaw
 * @returns {number}
 */
export function getEbbMosDamageBonus(isSuccessful, skillSuccessCount, ebbEffectRaw) {
    if (!isSuccessful) return 0;
    if (normalizeEbbEffect(ebbEffectRaw) !== 'damage') return 0;
    const n = Math.max(0, Math.floor(Number(skillSuccessCount) || 0));
    return n === 2 ? 1 : 0;
}
