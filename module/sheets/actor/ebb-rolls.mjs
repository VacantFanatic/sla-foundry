import { normalizeEbbEffect, normalizeEbbHealWoundMode } from '../../helpers/items.mjs';
import { syncEbbCriticalFlux } from '../../helpers/ebb-flux.mjs';
import { SlaSimpleContentDialog } from '../../apps/sla-simple-dialog.mjs';
import {
    buildEbbDamageFormula,
    buildSkillDiceResults,
    calculateEbbModifier,
    computeSuccessDieOutcome,
    resolveEbbDisciplineName,
    resolveEbbOutcomeText
} from './roll-math.mjs';

function resolveEbbContext(sheet, item) {
    const formulaRating = item.system.formulaRating || 7;
    const currentFlux = sheet.actor.system.stats.flux?.value || 0;
    const fluxCost = Math.max(0, Number(item.system.cost) || 1);
    const disciplineName = item.system.discipline;
    const ebbDisciplines = CONFIG.SLA?.ebbDisciplines || {};
    const resolvedDisciplineName = resolveEbbDisciplineName(disciplineName, ebbDisciplines);
    const disciplineItem = sheet.actor.items.find(
        (i) => i.type === 'discipline' && i.name.toLowerCase() === resolvedDisciplineName.toLowerCase()
    );

    return { formulaRating, currentFlux, fluxCost, resolvedDisciplineName, disciplineItem };
}

async function createAndEvaluateEbbRoll(rank) {
    const skillDiceCount = rank + 1;
    const rollFormula = `1d10 + ${skillDiceCount}d10`;
    let roll = new Roll(rollFormula);

    if (roll.terms.length > 0 && roll.terms[0].constructor.name === 'Die') {
        roll.terms[0].options.appearance = {
            foreground: '#FFFFFF',
            background: '#000000',
            edge: '#333333'
        };
    }

    await roll.evaluate();
    return roll;
}

function buildEbbTemplateData(
    sheet,
    {
        item,
        roll,
        modifier,
        resultColor,
        successTotal,
        skillDiceData,
        formulaRating,
        showDamageButton,
        showRemoveWoundsOnly,
        removeWoundsBundledWithHpRoll,
        healWoundMode,
        finalDmgFormula,
        isSuccessful,
        skillSuccesses,
        mosEffectText,
        failureConsequence,
        isHealRoll,
        ebbEffect,
        rollModifierNote
    }
) {
    const effectCount = item.effects?.size ?? 0;
    const ebbTarget = item.system.ebbTarget || 'enemy';
    const minDamageRaw = item.system.minDamage;
    const minDamage =
        minDamageRaw !== undefined && minDamageRaw !== null && String(minDamageRaw).trim() !== '' ? minDamageRaw : '0';
    const i18n = (k) => game.i18n?.localize(k) ?? k;
    const targetLabel = i18n(`SLA.EbbTarget.${ebbTarget}`);
    const effectLabel = i18n(`SLA.EbbEffect.${ebbEffect || 'damage'}`);
    const ebbHealWoundModeLabel = i18n(`SLA.EbbHealWoundMode.${healWoundMode === 'or' ? 'orHint' : 'andHint'}`);
    const showEbbHealWoundModeHint = Boolean(
        isHealRoll &&
        showDamageButton &&
        Math.max(0, Math.min(6, Math.floor(Number(item.system.removeWounds) || 0))) > 0
    );
    return {
        borderColor: resultColor,
        headerColor: resultColor,
        resultColor: resultColor,
        actorUuid: sheet.actor.uuid,
        itemName: item.name.toUpperCase(),
        successTotal: successTotal,
        tooltip: sheet._generateTooltip(roll, modifier, 0),
        skillDice: skillDiceData,
        notes: [`<strong>Formula Rating:</strong> ${formulaRating}`, rollModifierNote].filter(Boolean).join(' '),
        showDamageButton: showDamageButton,
        showRemoveWoundsOnly: showRemoveWoundsOnly,
        dmgFormula: finalDmgFormula,
        dmgDisplay: sheet._resolveDamageDisplay(finalDmgFormula),
        minDamage,
        adValue: item.system.ad || 0,
        attackType: 'ranged',
        mos: {
            isSuccess: isSuccessful,
            hits: skillSuccesses,
            effect: isSuccessful ? mosEffectText : failureConsequence
        },
        isEbb: true,
        ebbFormulaRoll: true,
        isHealRoll: Boolean(isHealRoll),
        ebbTarget,
        ebbEffect: ebbEffect || 'damage',
        ebbTargetLabel: targetLabel,
        ebbEffectLabel: effectLabel,
        removeWoundsCount: Math.max(0, Math.min(6, Math.floor(Number(item.system.removeWounds) || 0))),
        removeWoundsBundledWithHpRoll,
        ebbHealWoundMode: healWoundMode,
        ebbHealWoundModeLabel,
        showEbbHealWoundModeHint,
        showEbbEffectButtons: Boolean(isSuccessful && effectCount > 0 && ebbTarget !== 'self'),
        showEbbEffectSelfButton: Boolean(isSuccessful && effectCount > 0 && ebbTarget === 'self')
    };
}

/**
 * @param {import('../actor-sheet.mjs').SlaActorSheet} sheet
 * @param {Item} item
 * @param {{ situationalModifier?: number }} [overrides]
 */
export async function executeEbbRoll(sheet, item, overrides = {}) {
    const { situationalModifier = 0 } = overrides;
    const { formulaRating, currentFlux, fluxCost, resolvedDisciplineName, disciplineItem } = resolveEbbContext(
        sheet,
        item
    );
    if (currentFlux < fluxCost) {
        ui.notifications.error('Insufficient FLUX.');
        return;
    }
    await sheet.actor.update({ 'system.stats.flux.value': Math.max(0, currentFlux - fluxCost) });

    if (!disciplineItem) {
        ui.notifications.warn(`Missing Discipline Item: ${resolvedDisciplineName}`);
        return;
    }

    const rank = Number(disciplineItem.system.rank) || 0;
    const rollModifierTotal = sheet.actor.system.rollModifier?.total ?? 0;
    const rollModifierNotes = [
        rollModifierTotal !== 0 ? `Roll Modifier (${rollModifierTotal > 0 ? '+' : ''}${rollModifierTotal})` : '',
        situationalModifier !== 0
            ? `Situational Modifier (${situationalModifier > 0 ? '+' : ''}${situationalModifier})`
            : ''
    ].filter(Boolean);
    const rollModifierNote = rollModifierNotes.join(' ');
    const modifier = calculateEbbModifier({
        statValue: sheet.actor.system.stats.conc?.total ?? sheet.actor.system.stats.conc?.value ?? 0,
        rank,
        prone: Boolean(sheet.actor.system.conditions?.prone),
        stunned: Boolean(sheet.actor.system.conditions?.stunned),
        woundPenalty: sheet.actor.system.wounds.penalty || 0,
        applyWoundPenalties: game.settings.get('sla-industries', 'enableAutomaticWoundPenalties'),
        rollModifier: rollModifierTotal + situationalModifier
    });
    const roll = await createAndEvaluateEbbRoll(rank);
    const { sdTotal: successTotal, isBaseSuccess } = computeSuccessDieOutcome({
        sdRaw: roll.terms[0].results[0].result,
        baseModifier: modifier,
        successDieModifier: 0,
        targetNumber: formulaRating
    });
    const resultColor = isBaseSuccess ? '#39ff14' : '#f55';

    const { skillDiceData, skillSuccessCount: skillSuccesses } = buildSkillDiceResults({
        roll,
        baseModifier: modifier,
        targetNumber: formulaRating
    });
    const { isSuccessful, mosEffectText, failureConsequence } = resolveEbbOutcomeText(
        isBaseSuccess,
        skillSuccesses,
        item.system.ebbEffect
    );
    const {
        finalDmgFormula,
        showDamageButton,
        showRemoveWoundsOnly,
        removeWoundsBundledWithHpRoll,
        healWoundMode,
        ebbEffect,
        isHealRoll
    } = buildEbbDamageFormula(item, isSuccessful, skillSuccesses);
    const notesText = [`<strong>Formula Rating:</strong> ${formulaRating}`, rollModifierNote].filter(Boolean).join(' ');
    const templateData = buildEbbTemplateData(sheet, {
        item,
        roll,
        modifier,
        resultColor,
        successTotal,
        skillDiceData,
        formulaRating,
        showDamageButton,
        showRemoveWoundsOnly,
        removeWoundsBundledWithHpRoll,
        healWoundMode,
        finalDmgFormula,
        isSuccessful,
        skillSuccesses,
        mosEffectText,
        failureConsequence,
        isHealRoll,
        ebbEffect,
        rollModifierNote
    });

    const chatContent = await foundry.applications.handlebars.renderTemplate(
        'systems/sla-industries/templates/chat/chat-weapon-rolls.hbs',
        templateData
    );

    const ebbEffectCount = item.effects?.size ?? 0;
    const ebbRemoveWoundsCount = Math.max(0, Math.min(6, Math.floor(Number(item.system.removeWounds) || 0)));
    const ebbHealWoundMutualExclude = Boolean(
        isSuccessful &&
        normalizeEbbEffect(item.system.ebbEffect) === 'heal' &&
        normalizeEbbHealWoundMode(item.system.ebbHealWoundMode) === 'or' &&
        ebbRemoveWoundsCount > 0 &&
        showDamageButton
    );
    const message = await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: sheet.actor }),
        content: chatContent,
        flags: {
            sla: sheet._buildSlaRollFlags({
                baseModifier: modifier,
                itemName: item.name.toUpperCase(),
                notes: notesText,
                tn: formulaRating,
                extra: {
                    isWeapon: false,
                    isEbb: true,
                    itemUuid: item.uuid,
                    ebbHasEffects: ebbEffectCount > 0,
                    ebbRollSuccess: isSuccessful,
                    ebbTarget: item.system.ebbTarget || 'enemy',
                    ebbEffect: normalizeEbbEffect(item.system.ebbEffect),
                    actorUuid: sheet.actor.uuid,
                    ebbRemoveWoundsCount: ebbRemoveWoundsCount,
                    ebbHealWoundMode: normalizeEbbHealWoundMode(item.system.ebbHealWoundMode),
                    ebbHealWoundMutualExclude,
                    targets: Array.from(game.user.targets).map((t) => t.document.uuid)
                }
            })
        }
    });
    const chatMsg = Array.isArray(message) ? message[0] : message;
    if (chatMsg) {
        await syncEbbCriticalFlux(chatMsg, sheet.actor, chatMsg.flags?.sla ?? {}, isSuccessful, skillSuccesses);
    }
}

/**
 * Reads the situational-modifier input from a confirmed Ebb cast dialog and rolls with it applied.
 * @param {import('../actor-sheet.mjs').SlaActorSheet} sheet
 * @param {Item} item
 * @param {HTMLElement | HTMLFormElement | null} html
 */
export async function confirmEbbCast(sheet, item, html) {
    const root = html?.jquery ? html[0] : html;
    const form = root instanceof HTMLFormElement ? root : root?.querySelector?.('form');
    const situationalModifier = Number(form?.elements?.situationalModifier?.value) || 0;
    await executeEbbRoll(sheet, item, { situationalModifier });
}

/**
 * Pre-roll confirmation dialog for casting an Ebb Discipline formula. Lets the player apply a
 * free-form situational modifier to the roll (e.g. +3 for a MOS-3 reuse of this same ability
 * within 5 minutes per the rulebook, or -2 for choking) rather than the system tracking MOS-3
 * eligibility automatically.
 * @param {import('../actor-sheet.mjs').SlaActorSheet} sheet
 * @param {Item} item
 */
export async function renderEbbCastDialog(sheet, item) {
    const { formulaRating, fluxCost } = resolveEbbContext(sheet, item);

    const templateData = {
        item,
        formulaRating,
        fluxCost
    };

    const content = await foundry.applications.handlebars.renderTemplate(
        'systems/sla-industries/templates/dialogs/ebb-cast-dialog.hbs',
        templateData
    );

    await new SlaSimpleContentDialog({
        title: `Cast: ${item.name}`,
        contentHtml: content,
        width: 420,
        classes: ['sla-dialog-window', 'dialog'],
        actionLabel: 'ROLL',
        onConfirm: (root) => void confirmEbbCast(sheet, item, root)
    }).render(true);
}
