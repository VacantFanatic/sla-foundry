import { normalizeEbbEffect, normalizeEbbHealWoundMode } from '../../helpers/items.mjs';
import { getEbbMosDamageBonus } from '../../helpers/ebb-mos.mjs';

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
export function computeSkillRollModifier({ statValue, rank, prone, stunned, woundPenalty, applyWoundPenalties }) {
    let globalMod = 0;
    if (prone) globalMod -= 1;
    if (stunned) globalMod -= 1;
    const penalty = applyWoundPenalties ? woundPenalty : 0;
    return statValue + rank + globalMod - penalty;
}

/**
 * Stat checks succeed when the modified total exceeds the target (legacy SLA: > 10).
 * @param {number} finalTotal
 * @param {number} [targetNumber=10]
 */
export function isStatCheckSuccess(finalTotal, targetNumber = 10) {
    return finalTotal > targetNumber;
}

/**
 * @param {string} baseDamage
 * @param {number} totalModifier
 * @returns {string}
 */
export function buildWeaponDamageFormula(baseDamage, totalModifier) {
    if (totalModifier === 0) return baseDamage;
    if (baseDamage === '0' || baseDamage === '') return String(totalModifier);
    return `${baseDamage} ${totalModifier > 0 ? '+' : ''} ${totalModifier}`;
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
    let mosEffectText = isSuccess ? 'Standard Hit' : 'Failed';
    let mosChoiceData = { hasChoice: false, choiceType: '', choiceDmg: 0 };
    let shouldApplyHeadWound = false;

    if (isSuccess && !successThroughExperience) {
        if (skillSuccessCount === 1) {
            mosDamageBonus = 1;
            mosEffectText = '+1 Damage';
        } else if (skillSuccessCount === 2) {
            mosEffectText = 'MOS 2: Choose Effect';
            mosChoiceData = { hasChoice: true, choiceType: 'arm', choiceDmg: 2 };
        } else if (skillSuccessCount === 3) {
            mosEffectText = 'MOS 3: Choose Effect';
            mosChoiceData = { hasChoice: true, choiceType: 'leg', choiceDmg: 4 };
        } else if (skillSuccessCount >= 4) {
            mosDamageBonus = 6;
            mosEffectText = "<strong style='color:#ff5555'>HEAD SHOT</strong> (+6 DMG)";
            shouldApplyHeadWound = true;
        }
    }

    return { mosDamageBonus, mosEffectText, mosChoiceData, shouldApplyHeadWound };
}

/**
 * @param {number} strValue
 * @returns {number}
 */
export function computeMeleeStrDamageModifier(strValue) {
    const str = Number(strValue) || 0;
    if (str >= 7) return 4;
    if (str === 6) return 2;
    if (str === 5) return 1;
    return 0;
}

/**
 * @param {{ sdRaw: number, baseModifier: number, successDieModifier?: number, targetNumber: number }}
 */
export function computeSuccessDieOutcome({ sdRaw, baseModifier, successDieModifier = 0, targetNumber }) {
    const sdTotal = sdRaw + baseModifier + successDieModifier;
    return { sdRaw, sdTotal, isBaseSuccess: sdTotal >= targetNumber };
}

/**
 * @param {{ isBaseSuccess: boolean, skillSuccessCount: number, threshold?: number }}
 */
export function applySuccessThroughExperience({ isBaseSuccess, skillSuccessCount, threshold = 4 }) {
    let isSuccess = isBaseSuccess;
    let successThroughExperience = false;
    let note = null;

    if (!isBaseSuccess && skillSuccessCount >= threshold) {
        isSuccess = true;
        successThroughExperience = true;
        note = '<strong>Success Through Experience</strong> (4+ Skill Dice hit).';
    }

    return { isSuccess, successThroughExperience, note };
}

/**
 * @param {{ roll: { terms: Array<{ results?: Array<{ result: number }> }> }, baseModifier: number, targetNumber: number, autoSuccesses?: number, rerollIndexes?: number[], includeRerollFlag?: boolean }}
 */
export function buildSkillDiceResults({
    roll,
    baseModifier,
    targetNumber,
    autoSuccesses = 0,
    rerollIndexes = [],
    includeRerollFlag = false
}) {
    const rerollIndexSet = new Set(rerollIndexes);
    const skillDiceData = [];
    let skillSuccessCount = 0;

    if (roll.terms.length > 2 && roll.terms[2].results) {
        roll.terms[2].results.forEach((result, index) => {
            const total = result.result + baseModifier;
            const isHit = total >= targetNumber;
            if (isHit) skillSuccessCount++;

            const dieData = {
                raw: result.result,
                total: total,
                borderColor: isHit ? '#39ff14' : '#555',
                textColor: isHit ? '#39ff14' : '#ccc'
            };
            if (includeRerollFlag) {
                dieData.isReroll = rerollIndexSet.has(index);
            }
            skillDiceData.push(dieData);
        });
    }

    skillSuccessCount += autoSuccesses;
    for (let i = 0; i < autoSuccesses; i++) {
        skillDiceData.push({ raw: '-', total: 'Auto', borderColor: '#39ff14', textColor: '#39ff14' });
    }

    return { skillDiceData, skillSuccessCount };
}

/**
 * @param {number} rank
 * @param {{ rank?: number, reservedDice?: number, aimAuto?: number }} mods
 * @returns {number}
 */
export function computeWeaponSkillDiceCount(rank, mods = {}) {
    let count = rank + 1 + (mods.rank || 0) - (mods.reservedDice || 0) - (mods.aimAuto || 0);
    return Math.max(0, count);
}

/**
 * @param {HTMLFormElement} form
 */
export function readExplosiveRollForm(form) {
    return {
        mod: Number(form.modifier?.value) || 0,
        cover: Number(form.cover?.value) || 0,
        aiming: form.aiming?.value || 'none',
        blind: form.blind?.checked || false
    };
}

/**
 * @param {{ blastRadiusInner?: number, blastRadiusOuter?: number }} itemSystem
 */
export function resolveExplosiveBlastData(itemSystem) {
    const innerDist = itemSystem.blastRadiusInner || 0;
    let outerDist = itemSystem.blastRadiusOuter || 0;
    if (outerDist === 0) outerDist = 5;
    return { innerDist, outerDist };
}

/**
 * @param {number} strValue
 * @returns {number}
 */
export function computeExplosiveMaxRange(strValue) {
    const str = Math.min(Math.max(0, Number(strValue) || 0), 5);
    return 15 + str * 5;
}

/**
 * @param {{ mod: number }} rollData
 */
export function buildExplosiveMods(rollData) {
    return {
        successDie: 0,
        allDice: rollData.mod,
        rank: 0,
        damage: 0,
        autoSkillSuccesses: 0
    };
}

/**
 * @param {{ prone: boolean, stunned: boolean, woundPenalty: number, applyWoundPenalties: boolean, rollData: { cover: number, aiming: string }, mods: { allDice: number, successDie: number, autoSkillSuccesses: number } }}
 */
export function applyExplosiveRollAdjustments({ prone, stunned, woundPenalty, applyWoundPenalties, rollData, mods }) {
    if (prone) mods.allDice -= 1;
    if (stunned) mods.allDice -= 1;
    if (applyWoundPenalties) mods.allDice -= woundPenalty;

    mods.successDie += rollData.cover;
    if (rollData.aiming === 'sd') mods.successDie += 1;
    if (rollData.aiming === 'skill') mods.autoSkillSuccesses += 1;
}

/**
 * @param {string} disciplineName
 * @param {Record<string, string>} [ebbDisciplines]
 */
export function resolveEbbDisciplineName(disciplineName, ebbDisciplines = {}) {
    let resolvedName = disciplineName;
    for (const [key, label] of Object.entries(ebbDisciplines)) {
        if (key === disciplineName || label === disciplineName) {
            resolvedName = label;
            break;
        }
    }
    return resolvedName;
}

/**
 * @param {{ statValue: number, rank: number, prone: boolean, stunned: boolean, woundPenalty: number, applyWoundPenalties: boolean }}
 */
export function calculateEbbModifier({ statValue, rank, prone, stunned, woundPenalty, applyWoundPenalties }) {
    let globalMod = 0;
    if (prone) globalMod -= 1;
    if (stunned) globalMod -= 1;
    const penalty = applyWoundPenalties ? woundPenalty : 0;
    return statValue + rank - penalty + globalMod;
}

/**
 * @param {boolean} isBaseSuccess
 * @param {number} skillSuccesses
 * @param {string} ebbEffectRaw
 */
export function resolveEbbOutcomeText(isBaseSuccess, skillSuccesses, ebbEffectRaw) {
    const allDiceFailed = !isBaseSuccess && skillSuccesses === 0;
    const isSuccessful = isBaseSuccess;
    const ebbEffect = normalizeEbbEffect(ebbEffectRaw);
    const attackMos = ebbEffect === 'damage';

    let mosEffectText = 'Standard Success';
    let failureConsequence = 'Failed';

    if (isSuccessful) {
        if (skillSuccesses === 2) {
            mosEffectText = attackMos ? '+1 Damage / Effect' : 'Standard Success';
        } else if (skillSuccesses === 3) {
            mosEffectText = attackMos
                ? '+2 Damage / Repeat Ability'
                : 'May use the same Ebb ability again within 5 minutes (-3 FLUX)';
        } else if (skillSuccesses >= 4) {
            mosEffectText = attackMos
                ? "<strong style='color:#39ff14'>CRITICAL:</strong> +4 Dmg | Regain 1 FLUX"
                : "<strong style='color:#39ff14'>CRITICAL:</strong> Regain 1 FLUX";
        }
    } else if (allDiceFailed) {
        failureConsequence = "<strong style='color:#ff5555'>SEVERE FAILURE:</strong> -3 HP & -1 Extra FLUX";
    }

    return { isSuccessful, mosEffectText, failureConsequence };
}

/**
 * @param {Item} item
 * @param {boolean} isSuccessful
 * @param {number} skillSuccesses
 */
export function buildEbbDamageFormula(item, isSuccessful, skillSuccesses) {
    const rawBase = item.system.dmg || item.system.damage || '0';
    const baseDmg = String(rawBase);
    const ebbEffect = normalizeEbbEffect(item.system.ebbEffect);
    const mosDamageBonus = getEbbMosDamageBonus(isSuccessful, skillSuccesses, item.system.ebbEffect);

    let finalDmgFormula = baseDmg;
    if (baseDmg !== '0' && baseDmg !== '' && mosDamageBonus > 0) {
        finalDmgFormula = `${baseDmg} + ${mosDamageBonus}`;
    }

    const hasHpFormula = finalDmgFormula && finalDmgFormula !== '0' && String(finalDmgFormula).trim() !== '';
    const showHpRollButton = Boolean(isSuccessful && (ebbEffect === 'damage' || ebbEffect === 'heal') && hasHpFormula);
    const removeWoundsCount = Math.max(0, Math.min(6, Math.floor(Number(item.system.removeWounds) || 0)));
    const isHealEffect = ebbEffect === 'heal';
    const healWoundMode = normalizeEbbHealWoundMode(item.system.ebbHealWoundMode);
    const showRemoveWoundsOnly = Boolean(
        isSuccessful &&
        removeWoundsCount > 0 &&
        ((ebbEffect === 'effect' && !hasHpFormula) || (isHealEffect && healWoundMode === 'or' && hasHpFormula))
    );
    const removeWoundsBundledWithHpRoll = Boolean(
        showHpRollButton && removeWoundsCount > 0 && !(isHealEffect && healWoundMode === 'or')
    )
        ? removeWoundsCount
        : 0;

    return {
        finalDmgFormula,
        showDamageButton: showHpRollButton,
        showHpRollButton,
        showRemoveWoundsOnly,
        removeWoundsBundledWithHpRoll,
        healWoundMode,
        ebbEffect,
        isHealRoll: ebbEffect === 'heal'
    };
}
