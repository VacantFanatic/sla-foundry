import { createSLARoll } from '../../helpers/dice.mjs';
import {
    buildRollModifierNote,
    buildSkillRollModifierBreakdown,
    computeSkillRollModifier,
    isStatCheckSuccess
} from './roll-math.mjs';
import { renderSituationalRollDialog } from './situational-roll-dialog.mjs';
import { buildSlaRollFlags, generateSheetTooltip } from './sheet-helpers.mjs';

/**
 * @param {import('../actor-sheet.mjs').SlaActorSheet} sheet
 * @param {string} statKey
 * @param {{ situationalModifier?: number }} [overrides] One-off modifier from the pre-roll dialog
 */
export async function executeStatRoll(sheet, statKey, overrides = {}) {
    const { situationalModifier = 0 } = overrides;
    const actor = sheet.actor;
    const normalizedKey = statKey.toLowerCase();
    const statLabel = normalizedKey.toUpperCase();
    const statValue = actor.system.stats[normalizedKey]?.total ?? actor.system.stats[normalizedKey]?.value ?? 0;
    const rollModifierTotal = actor.system.rollModifier?.total ?? 0;

    const modifierParams = {
        statValue,
        rank: 0,
        prone: Boolean(actor.system.conditions?.prone),
        stunned: Boolean(actor.system.conditions?.stunned),
        woundPenalty: actor.system.wounds.penalty || 0,
        applyWoundPenalties: game.settings.get('sla-industries', 'enableAutomaticWoundPenalties'),
        rollModifier: rollModifierTotal,
        situationalModifier
    };
    const finalMod = computeSkillRollModifier(modifierParams);
    const modifierBreakdown = buildSkillRollModifierBreakdown({ statLabel, ...modifierParams });

    const roll = createSLARoll('1d10');
    await roll.evaluate();

    const finalTotal = roll.terms[0].results[0].result + finalMod;
    const isSuccess = isStatCheckSuccess(finalTotal);
    const resultColor = isSuccess ? '#39ff14' : '#f55';
    const rollModifierNote = buildRollModifierNote({ rollModifier: rollModifierTotal, situationalModifier });

    const templateData = {
        borderColor: resultColor,
        headerColor: resultColor,
        resultColor: resultColor,
        actorUuid: actor.uuid,
        itemName: `${statLabel} CHECK`,
        successTotal: finalTotal,
        tooltip: generateSheetTooltip(roll, finalMod, 0, modifierBreakdown),
        skillDice: [],
        notes: rollModifierNote,
        showDamageButton: false,
        canUseLuck: actor.system.stats.luck.value > 0,
        luckValue: actor.system.stats.luck.value,
        luckSpent: false,
        mos: {
            isSuccess: isSuccess,
            hits: 0,
            effect: isSuccess ? 'Success' : 'Failure'
        }
    };

    const chatContent = await foundry.applications.handlebars.renderTemplate(
        'systems/sla-industries/templates/chat/chat-weapon-rolls.hbs',
        templateData
    );

    await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: chatContent,
        flags: {
            sla: buildSlaRollFlags({
                baseModifier: finalMod,
                itemName: `${statLabel} CHECK`,
                notes: rollModifierNote,
                tn: 10
            })
        }
    });
}

/**
 * Pre-roll confirmation dialog for a stat check, with a one-off situational modifier.
 * @param {import('../actor-sheet.mjs').SlaActorSheet} sheet
 * @param {string} statKey
 */
export async function renderStatRollDialog(sheet, statKey) {
    const normalizedKey = statKey.toLowerCase();
    await renderSituationalRollDialog({
        title: `${normalizedKey.toUpperCase()} Check`,
        summaryLabel: 'Stat check',
        summary: normalizedKey.toUpperCase(),
        onConfirm: (situationalModifier) => executeStatRoll(sheet, normalizedKey, { situationalModifier })
    });
}
