/**
 * Pure wound counting and logic-condition helpers for actor derived data.
 */

const WOUND_FIELDS = ["head", "torso", "lArm", "rArm", "lLeg", "rLeg"];

/**
 * @param {Record<string, boolean | undefined>} wounds
 * @returns {number}
 */
export function countWounds(wounds = {}) {
    let woundCount = 0;
    for (const field of WOUND_FIELDS) {
        if (wounds[field] === true) woundCount++;
    }
    return woundCount;
}

/**
 * Conditions derived from wound flags and HP (excludes active-effect sync).
 * @param {Record<string, boolean | undefined>} wounds
 * @param {{ hpValue: number, woundCount: number, projectedHpMax: number }} context
 * @returns {{ dead: boolean, critical: boolean, stunned: boolean, immobile: boolean }}
 */
export function deriveLogicConditions(wounds, { hpValue, woundCount, projectedHpMax }) {
    const isDead = hpValue === 0 || woundCount >= 6;
    const isCritical = !isDead && hpValue > 0 && hpValue <= Math.floor(projectedHpMax / 2);

    return {
        dead: isDead,
        critical: isCritical,
        stunned: wounds.head === true,
        immobile: wounds.lLeg === true && wounds.rLeg === true
    };
}
