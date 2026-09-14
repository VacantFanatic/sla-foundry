/**
 * Pure encumbrance and armor PV helpers for actor derived data.
 */

/**
 * @param {{ type?: string, system?: { weight?: number, quantity?: number, powered?: boolean, resistance?: { value?: number } } }} item
 * @returns {number}
 */
export function computeCarriedItemWeight(item) {
    const d = item.system ?? {};
    let itemWeight = d.weight || 0;

    if (item.type === 'armor' && d.powered) {
        const currentRes = d.resistance?.value || 0;
        if (currentRes <= 0) {
            itemWeight = 6;
        }
    }

    return itemWeight * (d.quantity || 1);
}

/**
 * @param {number} totalWeight
 * @param {number} strTotal
 * @returns {{ value: number, max: number, penalty: number, moveCap: number | null, immobile: boolean }}
 */
export function computeEncumbranceState(totalWeight, strTotal) {
    const max = Math.max(8, strTotal * 3);
    const value = Math.round(totalWeight * 10) / 10;
    const encDiff = Math.floor(max - value);

    let penalty = 0;
    let moveCap = null;
    let immobile = false;

    if (encDiff === 1) {
        penalty = 1;
        moveCap = 1;
    } else if (encDiff === 0) {
        penalty = 2;
        moveCap = 1;
    } else if (encDiff < 0) {
        immobile = true;
    }

    return { value, max, penalty, moveCap, immobile };
}

/**
 * @param {number} basePv
 * @param {number} highestEquippedPv
 * @returns {number}
 */
export function computeEffectiveArmorPv(basePv, highestEquippedPv) {
    return Math.max(Number(basePv) || 0, highestEquippedPv);
}

/**
 * The shared "full / half / zero" PV rule: a resistance pool at or below zero blocks all PV,
 * below half its max halves PV (floored), otherwise the full PV applies. Used for body armor,
 * shields, and shield resistance degradation in the damage pipeline alike.
 * @param {number} basePv
 * @param {{ value?: number, max?: number } | null | undefined} resistance
 * @returns {number}
 */
export function applyResistanceToPv(basePv, resistance) {
    if (!resistance) return basePv;
    if (resistance.value <= 0) return 0;
    if (resistance.value < resistance.max / 2) return Math.floor(basePv / 2);
    return basePv;
}

/**
 * Effective PV for one equipped armor piece after resistance degradation.
 * @param {{ pv?: number, resistance?: { value?: number, max?: number } }} armorSystem
 * @returns {number}
 */
export function computeArmorPiecePv(armorSystem) {
    return applyResistanceToPv(armorSystem.pv || 0, armorSystem.resistance);
}

/**
 * PV contribution of one equipped shield for a given attack type, after resistance degradation.
 * @param {{ pvMelee?: number, pvRanged?: number, resistance?: { value?: number, max?: number } }} shieldSystem
 * @param {'melee'|'ranged'} attackType
 * @returns {number}
 */
export function computeShieldPieceBonus(shieldSystem, attackType) {
    const basePv = attackType === 'ranged' ? shieldSystem.pvRanged || 0 : shieldSystem.pvMelee || 0;
    return applyResistanceToPv(basePv, shieldSystem.resistance);
}
