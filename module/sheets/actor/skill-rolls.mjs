import { calculateRollResult, generateDiceTooltip, createSLARoll } from '../../helpers/dice.mjs';
import { buildSkillRollFormula, buildSkillRollModifierBreakdown, computeSkillRollModifier } from './roll-math.mjs';

/**
 * Execute a skill roll from an embedded skill item (shared by sheet and hotbar flows).
 * @param {import("../actor-sheet.mjs").SlaActorSheet} sheet
 * @param {Item} item
 */
export async function executeSkillRollFromItem(sheet, item) {
    if (!item || item.type !== 'skill') return;

    const actor = sheet.actor;
    const statKey = item.system.stat || 'dex';
    const statValue = actor.system.stats[statKey]?.total ?? actor.system.stats[statKey]?.value ?? 0;
    const rank = Number(item.system.rank) || 0;
    const rollModifierTotal = actor.system.rollModifier?.total ?? 0;

    const modifierParams = {
        statValue,
        rank,
        prone: Boolean(actor.system.conditions?.prone),
        stunned: Boolean(actor.system.conditions?.stunned),
        woundPenalty: actor.system.wounds.penalty || 0,
        applyWoundPenalties: game.settings.get('sla-industries', 'enableAutomaticWoundPenalties'),
        rollModifier: rollModifierTotal
    };
    const baseModifier = computeSkillRollModifier(modifierParams);
    const modifierBreakdown = buildSkillRollModifierBreakdown({
        statLabel: statKey.toUpperCase(),
        ...modifierParams
    });

    const rollFormula = buildSkillRollFormula(rank);
    const roll = createSLARoll(rollFormula);
    await roll.evaluate();

    const result = calculateRollResult(roll, baseModifier);
    const resultColor = result.isSuccess ? '#39ff14' : '#f55';
    const rollModifierNote =
        rollModifierTotal !== 0 ? `Roll Modifier (${rollModifierTotal > 0 ? '+' : ''}${rollModifierTotal})` : '';

    const templateData = {
        borderColor: resultColor,
        headerColor: resultColor,
        resultColor: resultColor,
        actorUuid: actor.uuid,
        itemName: item.name.toUpperCase(),
        successTotal: result.total,
        tooltip: generateDiceTooltip(roll, baseModifier, 0, 0, modifierBreakdown),
        skillDice: result.skillDiceData,
        notes: rollModifierNote,
        showDamageButton: false,
        canUseLuck: actor.system.stats.luck.value > 0,
        luckValue: actor.system.stats.luck.value,
        luckSpent: false,
        mos: {
            isSuccess: result.isSuccess,
            hits: result.skillHits,
            effect: result.isSuccess ? `Margin of Success: ${result.skillHits}` : 'Failed'
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
            sla: sheet._buildSlaRollFlags({
                baseModifier,
                itemName: item.name.toUpperCase(),
                notes: rollModifierNote,
                tn: 10,
                extra: {
                    rofRerollSD: false,
                    rofRerollSkills: []
                }
            })
        }
    });
}
