import { buildWeaponDamageFormula } from '../../sheets/actor/roll-math.mjs';

/**
 * Pure chat helpers extracted from SLAChat (unit tested).
 */

const WOUND_CLEAR_ORDER = ['head', 'torso', 'lArm', 'rArm', 'lLeg', 'rLeg'];

/**
 * @param {Record<string, boolean>} wounds
 * @param {number} count
 */
export function buildWoundClearUpdates(wounds, count) {
    const n = Math.max(0, Math.min(6, Math.floor(Number(count) || 0)));
    if (n === 0 || !wounds) return { updates: {}, clearedCount: 0 };

    let left = n;
    const updates = {};
    for (const key of WOUND_CLEAR_ORDER) {
        if (left <= 0) break;
        if (wounds[key]) {
            updates[`system.wounds.${key}`] = false;
            left--;
        }
    }

    return { updates, clearedCount: Object.keys(updates).length };
}

/**
 * @param {number} rawDamage
 * @param {number} effectivePV
 */
export function computeMitigatedDamage(rawDamage, effectivePV) {
    return Math.max(0, rawDamage - effectivePV);
}

/**
 * @param {number} currentHP
 * @param {number} maxHP
 * @param {number} rawHeal
 */
export function computeHealHpBounds(currentHP, maxHP, rawHeal) {
    const gain = Math.max(0, rawHeal);
    const newHP = Math.min(maxHP, currentHP + gain);
    return { newHP, finalHeal: newHP - currentHP };
}

/**
 * @param {string} baseNotes
 * @param {number} originalTN
 * @param {number} newTN
 */
export function buildDifficultyNotes(baseNotes, originalTN, newTN) {
    let notes = String(baseNotes ?? '');
    notes = notes.replace(/\s*\(TN\s+\d+(?:\s*→\s*\d+)?\)/g, '').trim();
    const tnNote = newTN !== originalTN ? ` (TN ${originalTN} → ${newTN})` : ` (TN ${newTN})`;
    return notes + tnNote;
}

/**
 * @param {string} baseDmg
 * @param {number} damageMod
 * @param {number} mosDamageBonus
 */
export function rebuildDifficultyDamageFormula(baseDmg, damageMod, mosDamageBonus) {
    const totalMod = (damageMod || 0) + (mosDamageBonus || 0);
    return buildWeaponDamageFormula(String(baseDmg ?? '0'), totalMod);
}

/**
 * @param {{ location: string, wounds: Record<string, boolean>, targetName: string, baseFormula: string, bonus: number }}
 */
export function resolveTacticalWoundOutcome({ location, wounds, targetName, baseFormula, bonus }) {
    const woundUpdates = {};
    let woundSuccess = false;
    let flavorText = '';
    let rollFormula = baseFormula;

    if (location === 'arm') {
        if (!wounds.lArm) {
            woundUpdates['system.wounds.lArm'] = true;
            woundSuccess = true;
            flavorText = `<span style="color:#ff4444">Snapped ${targetName}'s Left Arm!</span>`;
        } else if (!wounds.rArm) {
            woundUpdates['system.wounds.rArm'] = true;
            woundSuccess = true;
            flavorText = `<span style="color:#ff4444">Snapped ${targetName}'s Right Arm!</span>`;
        }
    } else if (location === 'leg') {
        if (!wounds.lLeg) {
            woundUpdates['system.wounds.lLeg'] = true;
            woundSuccess = true;
            flavorText = `<span style="color:#ff4444">Broken ${targetName}'s Left Leg!</span>`;
        } else if (!wounds.rLeg) {
            woundUpdates['system.wounds.rLeg'] = true;
            woundSuccess = true;
            flavorText = `<span style="color:#ff4444">Broken ${targetName}'s Right Leg!</span>`;
        }
    }

    if (!woundSuccess) {
        flavorText = `<span style="color:orange">Limbs Gone! Reverting to +${bonus} Dmg.</span>`;
        rollFormula = `${baseFormula} + ${bonus}`;
    }

    return { woundSuccess, flavorText, rollFormula, woundUpdates };
}
