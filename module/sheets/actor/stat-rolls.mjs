import { createSLARoll } from '../../helpers/dice.mjs';
import { computeSkillRollModifier, isStatCheckSuccess } from './roll-math.mjs';
import { buildSlaRollFlags, generateSheetTooltip } from './sheet-helpers.mjs';

/**
 * @param {import('../actor-sheet.mjs').SlaActorSheet} sheet
 * @param {string} statKey
 */
export async function executeStatRoll(sheet, statKey) {
    const actor = sheet.actor;
    const normalizedKey = statKey.toLowerCase();
    const statLabel = normalizedKey.toUpperCase();
    const statValue = actor.system.stats[normalizedKey]?.total ?? actor.system.stats[normalizedKey]?.value ?? 0;

    const finalMod = computeSkillRollModifier({
        statValue,
        rank: 0,
        prone: Boolean(actor.system.conditions?.prone),
        stunned: Boolean(actor.system.conditions?.stunned),
        woundPenalty: actor.system.wounds.penalty || 0,
        applyWoundPenalties: game.settings.get('sla-industries', 'enableAutomaticWoundPenalties')
    });

    const roll = createSLARoll('1d10');
    await roll.evaluate();

    const finalTotal = roll.terms[0].results[0].result + finalMod;
    const isSuccess = isStatCheckSuccess(finalTotal);
    const resultColor = isSuccess ? '#39ff14' : '#f55';

    const templateData = {
        borderColor: resultColor,
        headerColor: resultColor,
        resultColor: resultColor,
        actorUuid: actor.uuid,
        itemName: `${statLabel} CHECK`,
        successTotal: finalTotal,
        tooltip: generateSheetTooltip(roll, finalMod, 0),
        skillDice: [],
        notes: '',
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

    roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: chatContent,
        flags: {
            sla: buildSlaRollFlags({
                baseModifier: finalMod,
                itemName: `${statLabel} CHECK`,
                notes: '',
                tn: 10
            })
        }
    });
}
