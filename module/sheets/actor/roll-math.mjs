/**
 * Pure roll math helpers extracted from SlaActorSheet.
 */

/**
 * @param {number} rank
 * @returns {string}
 */
export function buildSkillRollFormula(rank) {
    const skillDiceCount = rank + 1;
    return `1d10 + ${skillDiceCount}d10`;
}

/**
 * @param {{ statValue: number, rank: number, prone: boolean, stunned: boolean, woundPenalty: number, applyWoundPenalties: boolean }} params
 * @returns {number}
 */
export function computeSkillRollModifier({
    statValue,
    rank,
    prone,
    stunned,
    woundPenalty,
    applyWoundPenalties
}) {
    let globalMod = 0;
    if (prone) globalMod -= 1;
    if (stunned) globalMod -= 1;
    const penalty = applyWoundPenalties ? woundPenalty : 0;
    return statValue + rank + globalMod - penalty;
}

/**
 * @param {string} baseDamage
 * @param {number} totalModifier
 * @returns {string}
 */
export function buildWeaponDamageFormula(baseDamage, totalModifier) {
    if (totalModifier === 0) return baseDamage;
    if (baseDamage === "0" || baseDamage === "") return String(totalModifier);
    return `${baseDamage} ${totalModifier > 0 ? "+" : ""} ${totalModifier}`;
}

/**
 * @param {{ modifier?: number, aimSd?: number, aimAuto?: number, combatDef?: number, acroDef?: number, targetProne?: boolean }} formState
 */
export function readWeaponRollFormState(form) {
    return {
        modifier: Number(form.modifier?.value) || 0,
        aimSd: Number(form.aim_sd?.value) || 0,
        aimAuto: Number(form.aim_auto?.value) || 0,
        combatDef: Number(form.combatDef?.value) || 0,
        acroDef: Number(form.acroDef?.value) || 0,
        targetProne: form.prone?.checked || false
    };
}

/**
 * @param {{ modifier: number, aimSd: number, aimAuto: number, combatDef: number, acroDef: number, targetProne: boolean }} formState
 */
export function buildWeaponRollMods(formState) {
    return {
        successDie: 0,
        allDice: formState.modifier,
        rank: 0,
        damage: 0,
        autoSkillSuccesses: 0,
        reservedDice: 0,
        aimSd: formState.aimSd,
        aimAuto: formState.aimAuto,
        combatDef: formState.combatDef,
        acroDef: formState.acroDef,
        targetProne: formState.targetProne
    };
}

/**
 * @param {{ isSuccess: boolean, successThroughExperience: boolean, skillSuccessCount: number }}
 */
export function resolveWeaponMosOutcome({ isSuccess, successThroughExperience, skillSuccessCount }) {
    let mosDamageBonus = 0;
    let mosEffectText = isSuccess ? "Standard Hit" : "Failed";
    let mosChoiceData = { hasChoice: false, choiceType: "", choiceDmg: 0 };
    let shouldApplyHeadWound = false;

    if (isSuccess && !successThroughExperience) {
        if (skillSuccessCount === 1) {
            mosDamageBonus = 1;
            mosEffectText = "+1 Damage";
        } else if (skillSuccessCount === 2) {
            mosEffectText = "MOS 2: Choose Effect";
            mosChoiceData = { hasChoice: true, choiceType: "arm", choiceDmg: 2 };
        } else if (skillSuccessCount === 3) {
            mosEffectText = "MOS 3: Choose Effect";
            mosChoiceData = { hasChoice: true, choiceType: "leg", choiceDmg: 4 };
        } else if (skillSuccessCount >= 4) {
            mosDamageBonus = 6;
            mosEffectText = "<strong style='color:#ff5555'>HEAD SHOT</strong> (+6 DMG)";
            shouldApplyHeadWound = true;
        }
    }

    return { mosDamageBonus, mosEffectText, mosChoiceData, shouldApplyHeadWound };
}
