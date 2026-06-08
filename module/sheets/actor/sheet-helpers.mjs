import { generateDiceTooltip } from '../../helpers/dice.mjs';
import { applySuccessThroughExperience, buildSkillDiceResults, computeSuccessDieOutcome } from './roll-math.mjs';

export function generateSheetTooltip(roll, baseModifier, successDieMod) {
    return generateDiceTooltip(roll, baseModifier, 0, successDieMod);
}

export function buildSlaRollFlags({ baseModifier, itemName, notes = '', tn = 10, extra = {} }) {
    return {
        baseModifier,
        itemName,
        notes,
        tn,
        ...extra
    };
}

export function resolveSheetDamageDisplay(formula, actor) {
    const formulaStr = String(formula ?? '0').trim();
    if (!formulaStr || formulaStr === '0') return '0';
    if (formulaStr.includes('d')) return formulaStr;

    try {
        const replaced = Roll.replaceFormulaData(formulaStr, actor?.getRollData?.() ?? {});
        const resolved = Math.round(Number(Function('"use strict";return (' + replaced + ')')()));
        const clamped = Number.isFinite(resolved) ? Math.max(0, resolved) : null;
        return clamped !== null ? String(clamped) : formulaStr;
    } catch (_err) {
        return formulaStr;
    }
}

export function resolveCombatSkillRank(actor, skillInput) {
    if (!skillInput) return 0;

    const combatSkills = CONFIG.SLA?.combatSkills || {};
    const resolvedSkillName = combatSkills[skillInput] || skillInput;
    const skillItem = actor.items.find(
        (i) => i.type === 'skill' && i.name.trim().toLowerCase() === resolvedSkillName.trim().toLowerCase()
    );
    return skillItem ? Number(skillItem.system.rank) || 0 : 0;
}

export async function applyHeadshotSideEffect(notes) {
    if (game.user.targets.size === 0) return;

    const target = game.user.targets.first();
    const targetActor = target?.actor;
    if (targetActor && !targetActor.system.wounds.head) {
        await targetActor.update({ 'system.wounds.head': true });
        notes.push(`<span style="color:#ff5555">Head Wound Applied!</span>`);
    }
}

export function buildSkillDiceResultsForSheet(params) {
    return buildSkillDiceResults(params);
}

export function computeSuccessDieOutcomeForSheet({ roll, baseModifier, successDieModifier = 0, targetNumber }) {
    const sdRaw = roll.terms[0].results[0].result;
    return computeSuccessDieOutcome({ sdRaw, baseModifier, successDieModifier, targetNumber });
}

export function applySuccessThroughExperienceForSheet({ isBaseSuccess, skillSuccessCount, threshold = 4, notes }) {
    const result = applySuccessThroughExperience({ isBaseSuccess, skillSuccessCount, threshold });
    if (result.note && notes) notes.push(result.note);
    return { isSuccess: result.isSuccess, successThroughExperience: result.successThroughExperience };
}
