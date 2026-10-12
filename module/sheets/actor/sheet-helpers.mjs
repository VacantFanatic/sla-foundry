import { generateDiceTooltip } from '../../helpers/dice.mjs';
import { applySuccessThroughExperience, buildSkillDiceResults, computeSuccessDieOutcome } from './roll-math.mjs';

export function generateSheetTooltip(roll, baseModifier, successDieMod, breakdown = []) {
    return generateDiceTooltip(roll, baseModifier, 0, successDieMod, breakdown);
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

const HEADSHOT_SOCKET_EVENT = 'system.sla-industries';
const HEADSHOT_SOCKET_ACTION = 'applyHeadWound';
let headshotSocketRegistered = false;

async function applyHeadWoundToActor(actor) {
    if (!actor || actor.system?.wounds?.head) return false;
    await actor.update({ 'system.wounds.head': true });
    return true;
}

/**
 * Active-GM side of the head-wound relay. Accepts only "set the head wound on this actor",
 * never arbitrary data.
 */
export async function handleHeadshotSocketMessage(data) {
    if (data?.action !== HEADSHOT_SOCKET_ACTION) return;
    if (!game.user.isActiveGM) return;
    if (typeof data.actorUuid !== 'string') return;
    try {
        const doc = await fromUuid(data.actorUuid);
        // A token UUID resolves to a TokenDocument; unwrap it to its actor.
        const actor = doc?.documentName === 'Token' ? doc.actor : doc;
        if (actor?.documentName !== 'Actor') return;
        await applyHeadWoundToActor(actor);
    } catch (err) {
        console.error('SLA | Failed to apply relayed head wound', err);
    }
}

function registerHeadshotSocket() {
    if (headshotSocketRegistered || !game?.socket) return;
    headshotSocketRegistered = true;
    game.socket.on(HEADSHOT_SOCKET_EVENT, handleHeadshotSocketMessage);
}

if (typeof game !== 'undefined' && game?.ready) registerHeadshotSocket();
else if (typeof Hooks !== 'undefined') Hooks.once('ready', registerHeadshotSocket);

export async function applyHeadshotSideEffect(notes) {
    if (game.user.targets.size === 0) return;

    const target = game.user.targets.first();
    const targetActor = target?.actor;
    if (!targetActor || targetActor.system.wounds.head) return;

    if (targetActor.canUserModify(game.user, 'update')) {
        await applyHeadWoundToActor(targetActor);
        notes.push(`<span style="color:#ff5555">Head Wound Applied!</span>`);
        return;
    }

    // The attacker cannot modify the target: ask the active GM's client to apply it.
    if (!game.users.activeGM) {
        notes.push(`<span style="color:#ff5555">Head Wound not applied: no GM is online to apply it.</span>`);
        return;
    }
    game.socket.emit(HEADSHOT_SOCKET_EVENT, {
        action: HEADSHOT_SOCKET_ACTION,
        actorUuid: targetActor.uuid
    });
    notes.push(`<span style="color:#ff5555">Head Wound Applied!</span>`);
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
