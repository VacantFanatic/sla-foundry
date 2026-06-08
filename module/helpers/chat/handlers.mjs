import { LuckDialog } from '../../apps/luck-dialog.mjs';
import { calculateRollResult, generateDiceTooltip } from '../dice.mjs';
import { syncEbbCriticalFlux } from '../ebb-flux.mjs';
import { normalizeEbbEffect } from '../items.mjs';
import { resolveEbbOutcomeText, resolveWeaponMosOutcome } from '../../sheets/actor/roll-math.mjs';
import {
    applyEbbOutcomeToActor,
    clearNWoundsOnActor,
    executeStandardDamageRoll,
    resolveDamageDisplay,
    resolveEbbFormulaVictim,
    resolveVictimForApplyDamage
} from './damage.mjs';
import { getChatMessageId, readDataNumber, readDataString, setButtonDisabled, toggleTooltip } from './dom.mjs';
import { buildDifficultyNotes, rebuildDifficultyDamageFormula, resolveTacticalWoundOutcome } from './pure.mjs';

export async function onRollDamage(ev) {
    ev.preventDefault();
    const btn = ev.currentTarget;
    const card = btn.closest('.sla-chat-card');
    if (!card) return;

    try {
        const action = readDataString(btn, 'action') || 'standard';

        const uuid = readDataString(card, 'actor-uuid');
        const actorId = readDataString(card, 'actor-id');
        let actor = uuid ? await fromUuid(uuid) : game.actors.get(actorId);

        if (!actor) return ui.notifications.error('SLA | Actor not found.');
        if (!actor.isOwner) return ui.notifications.warn('You do not own this actor.');

        const messageId = getChatMessageId(card);
        const parentMessage = game.messages.get(messageId);
        const guardFlags = parentMessage?.flags?.sla ?? {};
        if (guardFlags.isEbb && guardFlags.ebbRollSuccess === false) {
            return ui.notifications.warn(
                'SLA | This Ebb check did not succeed; damage, healing, and wound removal are not available.'
            );
        }

        const isHealEbbStandardRoll = action === 'standard' && btn.getAttribute('data-is-heal') === 'true';
        if (
            guardFlags.ebbHealWoundMutualExclude &&
            isHealEbbStandardRoll &&
            guardFlags.ebbHealWoundPathUsed === 'wounds'
        ) {
            return ui.notifications.warn(game.i18n.localize('SLA.EbbHealWoundHealLockedAfterWounds'));
        }

        const parentTargets = Array.isArray(guardFlags.targets) ? guardFlags.targets : [];

        let rollFormula = '';
        let flavorText = '';
        let adValue = readDataNumber(btn, 'ad', 0);

        setButtonDisabled(btn, true);

        if (action === 'damage' || action === 'wound') {
            const baseFormula = String(readDataString(btn, 'base-formula') || '0');
            const bonus = readDataNumber(btn, 'damage-bonus', 0);

            if (action === 'damage') {
                flavorText = `<span style="color:#39ff14">Tactical Choice: +${bonus} Damage</span>`;
                rollFormula = `${baseFormula} + ${bonus}`;
            } else if (action === 'wound') {
                const location = readDataString(btn, 'location');
                let woundSuccess = false;

                if (parentTargets.length > 0) {
                    const targetToken = await fromUuid(parentTargets[0]);
                    const targetActor = targetToken?.actor;

                    if (targetActor) {
                        const outcome = resolveTacticalWoundOutcome({
                            location,
                            wounds: targetActor.system.wounds,
                            targetName: targetActor.name,
                            baseFormula,
                            bonus
                        });
                        woundSuccess = outcome.woundSuccess;
                        flavorText = outcome.flavorText;
                        if (Object.keys(outcome.woundUpdates).length) {
                            await targetActor.update(outcome.woundUpdates);
                        }
                    }
                }

                if (woundSuccess) {
                    rollFormula = baseFormula;
                } else {
                    flavorText = `<span style="color:orange">Limbs Gone! Reverting to +${bonus} Dmg.</span>`;
                    rollFormula = `${baseFormula} + ${bonus}`;
                }
            }
        } else {
            rollFormula = String(readDataString(btn, 'formula') || '0');
            flavorText = 'Standard Damage Roll';
        }

        const isHealRoll = btn.getAttribute('data-is-heal') === 'true';
        const removeWoundsCountRoll = Math.max(
            0,
            Math.min(6, Math.floor(Number(btn.getAttribute('data-remove-wounds-count')) || 0))
        );
        const ebbTargetRoll = btn.getAttribute('data-ebb-target') || 'enemy';
        if (action === 'standard' && isHealRoll) {
            flavorText = game.i18n.localize('SLA.EbbStandardHealRoll');
        }

        const minDmgRaw = btn.getAttribute('data-min') || readDataString(btn, 'min') || '0';
        const minDmg = Math.max(0, Number(minDmgRaw) || 0);

        let woundBtnPrelocked = false;
        if (guardFlags.ebbHealWoundMutualExclude && action === 'standard' && isHealRoll) {
            for (const woundBtn of card.querySelectorAll('.sla-ebb-remove-wounds-btn')) {
                setButtonDisabled(woundBtn, true, game.i18n.localize('SLA.EbbHealWoundLockedOtherUsedHeal'));
            }
            woundBtnPrelocked = true;
        }

        try {
            await executeStandardDamageRoll({
                actor,
                rollData: actor.getRollData?.(),
                rollFormula,
                adValue,
                minDamage: minDmg,
                flavorText,
                parentTargets,
                autoApplyWound: action === 'wound',
                isHeal: isHealRoll,
                removeWoundsCount: removeWoundsCountRoll,
                ebbTarget: ebbTargetRoll
            });
            if (woundBtnPrelocked && parentMessage?.id) {
                const fresh = game.messages.get(parentMessage.id);
                await fresh?.update({ 'flags.sla.ebbHealWoundPathUsed': 'heal' });
            }
        } catch (rollErr) {
            if (woundBtnPrelocked) {
                for (const woundBtn of card.querySelectorAll('.sla-ebb-remove-wounds-btn')) {
                    setButtonDisabled(woundBtn, false);
                }
            }
            throw rollErr;
        }
    } catch (err) {
        console.error('SLA | Error in onRollDamage:', err);
        ui.notifications.error('SLA | Failed to roll damage. See console for details.');
        setButtonDisabled(btn, false);
    }
}

export async function onApplyDamage(ev) {
    ev.preventDefault();
    const btn = ev.currentTarget;

    try {
        const rawDamage = readDataNumber(btn, 'dmg', 0);
        const ad = readDataNumber(btn, 'ad', 0);
        const type = readDataString(btn, 'target');
        const targetUuid = readDataString(btn, 'target-uuid');

        const card = btn.closest('.sla-chat-card');
        if (!card) return;
        const messageId = getChatMessageId(card);
        const message = game.messages.get(messageId);
        const mflags = message?.flags?.sla ?? {};

        const rollingUuid = readDataString(card, 'actor-uuid') || mflags.ebbCasterUuid;
        const rollingActor = rollingUuid ? await fromUuid(rollingUuid) : null;

        const isHeal = Boolean(btn.getAttribute('data-is-heal') === 'true' || mflags.ebbIsHeal);
        let removeWoundsCount = 0;
        const rwAttr = btn.getAttribute('data-remove-wounds-count');
        if (rwAttr !== undefined && rwAttr !== '') {
            removeWoundsCount = Math.max(0, Math.min(6, Math.floor(Number(rwAttr) || 0)));
        } else if (mflags.ebbRemoveWoundsCount != null) {
            removeWoundsCount = Math.max(0, Math.min(6, Math.floor(Number(mflags.ebbRemoveWoundsCount) || 0)));
        } else if (mflags.ebbRemoveWounds === true) {
            removeWoundsCount = 6;
        }
        const ebbTarget = btn.getAttribute('data-ebb-target') || mflags.ebbTarget || 'enemy';

        const parentTargets = Array.isArray(mflags.targets) ? mflags.targets : [];
        const victim = await resolveEbbFormulaVictim(rollingActor, ebbTarget, {
            type,
            targetUuid,
            parentTargets
        });
        if (!victim) return;

        await applyEbbOutcomeToActor(victim, rawDamage, ad, { isHeal, removeWoundsCount });
    } catch (err) {
        console.error('SLA | Error in onApplyDamage:', err);
        ui.notifications.error('SLA | Failed to apply damage. See console for details.');
    }
}

export async function onApplyEbbEffects(ev) {
    ev.preventDefault();
    const btn = ev.currentTarget;

    try {
        if (!game.user.isGM) {
            ui.notifications.warn('SLA | Only a GM can apply formula effects.');
            return;
        }

        const card = btn.closest('.sla-chat-card');
        if (!card) return;
        const messageId = getChatMessageId(card);
        const message = game.messages.get(messageId);
        if (!message) return;

        const flags = message.flags?.sla ?? {};
        if (!flags.ebbRollSuccess || !flags.ebbHasEffects || !flags.itemUuid) {
            ui.notifications.warn('SLA | This roll cannot apply Ebb formula effects.');
            return;
        }

        const item = await fromUuid(flags.itemUuid);
        if (!item || item.type !== 'ebbFormula' || !(item.effects?.size > 0)) {
            ui.notifications.warn('SLA | Ebb formula or embedded effects not found.');
            return;
        }

        const type = readDataString(btn, 'target');
        const targetUuid = btn.getAttribute('data-target-uuid') || readDataString(btn, 'target-uuid');

        let victim = null;
        if (type === 'self') {
            const casterUuid = readDataString(card, 'actor-uuid') || flags.actorUuid;
            victim = casterUuid ? await fromUuid(casterUuid) : null;
            if (!victim) {
                ui.notifications.warn('SLA | Could not resolve caster for formula effects.');
                return;
            }
        } else {
            victim = await resolveVictimForApplyDamage({ targetUuid, type });
        }
        if (!victim) return;

        await item.applyItemEffectsToActor(victim);
        ui.notifications.info(`SLA | Applied ${item.name} effects to ${victim.name}.`);
    } catch (err) {
        console.error('SLA | Error in onApplyEbbEffects:', err);
        ui.notifications.error('SLA | Failed to apply formula effects. See console for details.');
    }
}

export async function onRemoveEbbWounds(ev) {
    ev.preventDefault();
    const btn = ev.currentTarget;

    try {
        const card = btn.closest('.sla-chat-card');
        if (!card) return;
        const messageId = getChatMessageId(card);
        const message = game.messages.get(messageId);
        const flags = message?.flags?.sla ?? {};

        if (flags.isEbb && flags.ebbRollSuccess === false) {
            ui.notifications.warn('SLA | This Ebb check did not succeed; wound removal is not available.');
            return;
        }

        if (flags.ebbHealWoundMutualExclude && flags.ebbHealWoundPathUsed === 'heal') {
            ui.notifications.warn(game.i18n.localize('SLA.EbbHealWoundWoundsLockedAfterHeal'));
            return;
        }

        const casterUuid = readDataString(card, 'actor-uuid') || flags.actorUuid;
        const rollingActor = casterUuid ? await fromUuid(casterUuid) : null;
        const ebbTarget = flags.ebbTarget || btn.getAttribute('data-ebb-target') || 'enemy';
        const parentTargets = Array.isArray(flags.targets) ? flags.targets : [];

        const resolveType = ebbTarget === 'ally' ? 'selected' : 'target';
        const victim = await resolveEbbFormulaVictim(rollingActor, ebbTarget, {
            type: resolveType,
            targetUuid: null,
            parentTargets
        });
        if (!victim) return;

        if (!victim.testUserPermission(game.user, 'OWNER') && !game.user.isGM) {
            ui.notifications.warn(game.i18n.localize('SLA.EbbNoPermissionWounds'));
            return;
        }

        const requested = Math.max(0, Math.min(6, Math.floor(Number(flags.ebbRemoveWoundsCount) || 0)));
        if (requested <= 0) {
            ui.notifications.warn(game.i18n.localize('SLA.EbbNoWoundsToRemove'));
            return;
        }

        setButtonDisabled(btn, true);
        let healBtnPrelocked = false;
        if (flags.ebbHealWoundMutualExclude && !flags.ebbHealWoundPathUsed) {
            for (const healBtn of card.querySelectorAll('.damage-roll')) {
                setButtonDisabled(healBtn, true, game.i18n.localize('SLA.EbbHealWoundLockedOtherUsedWounds'));
            }
            healBtnPrelocked = true;
        }

        try {
            const removed = await clearNWoundsOnActor(victim, requested);
            ui.notifications.info(
                game.i18n.format('SLA.EbbNWoundsRemoved', { name: victim.name, count: removed, requested })
            );
        } catch (innerErr) {
            if (healBtnPrelocked) {
                for (const healBtn of card.querySelectorAll('.damage-roll')) {
                    setButtonDisabled(healBtn, false);
                }
            }
            setButtonDisabled(btn, false);
            throw innerErr;
        }
        if (healBtnPrelocked && message?.id) {
            try {
                const fresh = game.messages.get(message.id);
                await fresh?.update({ 'flags.sla.ebbHealWoundPathUsed': 'wounds' });
            } catch (flagErr) {
                console.warn('SLA | Failed to persist ebbHealWoundPathUsed', flagErr);
            }
        }
    } catch (err) {
        console.error('SLA | Error in onRemoveEbbWounds:', err);
        ui.notifications.error('SLA | Failed to remove wounds. See console for details.');
    }
}

export function onToggleRoll(ev) {
    ev.preventDefault();
    const btn = ev.currentTarget;
    const card = btn.closest('.sla-chat-card');
    const tooltip = card?.querySelector('.dice-tooltip');
    toggleTooltip(tooltip);
}

export async function onLuck(ev) {
    ev.preventDefault();
    const btn = ev.currentTarget;
    const card = btn.closest('.sla-chat-card');
    if (!card) return;

    const uuid = readDataString(card, 'actor-uuid');
    const actorId = readDataString(card, 'actor-id');
    let actor = uuid ? await fromUuid(uuid) : game.actors.get(actorId);

    if (!actor) return ui.notifications.error('SLA | Actor not found.');
    if (!actor.isOwner) return ui.notifications.warn('You do not own this actor.');

    const messageId = getChatMessageId(card);
    const message = game.messages.get(messageId);
    if (!message) return;

    const flags = message.flags.sla || {};
    if (flags.luckSpent) {
        return ui.notifications.warn(
            'SLA | Luck has already been spent on this roll. Only one option may be applied per roll.'
        );
    }

    const roll = message.rolls[0];
    if (!roll) return ui.notifications.warn('No roll data found.');

    LuckDialog.create(actor, roll, messageId);
}

async function applyHeadshotForDifficultyRecalc(flags) {
    const targets = flags.targets || [];
    if (targets.length === 0) return;

    const targetToken = await fromUuid(targets[0]);
    const targetActor = targetToken?.actor;
    if (targetActor && !targetActor.system.wounds.head) {
        await targetActor.update({ 'system.wounds.head': true });
    }
}

async function resolveDifficultyRecalcMos(flags, result, isSuccess, skillSuccessCount) {
    if (flags.isEbb) {
        const ebb = resolveEbbOutcomeText(isSuccess, skillSuccessCount, flags.ebbEffect);
        let mosDamageBonus = 0;
        if (isSuccess && normalizeEbbEffect(flags.ebbEffect) === 'damage') {
            if (skillSuccessCount === 2) mosDamageBonus = 1;
            else if (skillSuccessCount === 3) mosDamageBonus = 2;
            else if (skillSuccessCount >= 4) mosDamageBonus = 4;
        }
        return {
            mosDamageBonus,
            mosEffectText: isSuccess ? ebb.mosEffectText : ebb.failureConsequence,
            mosChoiceData: { hasChoice: false, choiceType: '', choiceDmg: 0 }
        };
    }

    if (flags.isWeapon) {
        const mos = resolveWeaponMosOutcome({
            isSuccess,
            successThroughExperience: result.successThroughExperience,
            skillSuccessCount
        });
        if (mos.shouldApplyHeadWound) {
            await applyHeadshotForDifficultyRecalc(flags);
        }
        if (result.successThroughExperience) {
            return {
                mosDamageBonus: mos.mosDamageBonus,
                mosEffectText: 'Success Through Experience',
                mosChoiceData: mos.mosChoiceData
            };
        }
        return {
            mosDamageBonus: mos.mosDamageBonus,
            mosEffectText: mos.mosEffectText,
            mosChoiceData: mos.mosChoiceData
        };
    }

    return {
        mosDamageBonus: 0,
        mosEffectText: isSuccess ? `Margin of Success: ${skillSuccessCount}` : 'Failed',
        mosChoiceData: { hasChoice: false, choiceType: '', choiceDmg: 0 }
    };
}

export async function onChangeDifficulty(ev) {
    ev.preventDefault();
    const btn = ev.currentTarget;
    if (!game.user.isGM) return ui.notifications.warn('Only GM can adjust difficulty.');

    try {
        const card = btn.closest('.sla-chat-card');
        if (!card) return;
        const newTN = readDataNumber(btn, 'tn', 10);

        const messageId = getChatMessageId(card);
        const message = game.messages.get(messageId);
        if (!message) return;

        const flags = message.flags.sla || {};
        const roll = message.rolls[0];
        if (!roll) return;

        const damageRollBtn = card.querySelector('.damage-roll');
        const minDamage = readDataNumber(damageRollBtn, 'min', 0);
        const result = calculateRollResult(roll, flags.baseModifier, newTN, {
            autoSkillSuccesses: flags.autoSkillSuccesses || 0
        });
        const isSuccess = result.isSuccess;
        const skillSuccessCount = result.skillHits + (flags.autoSkillSuccesses || 0);
        const { mosDamageBonus, mosEffectText, mosChoiceData } = await resolveDifficultyRecalcMos(
            flags,
            result,
            isSuccess,
            skillSuccessCount
        );
        const finalDmgFormula = rebuildDifficultyDamageFormula(flags.damageBase, flags.damageMod, mosDamageBonus);

        const showButton = isSuccess && finalDmgFormula && finalDmgFormula !== '0';
        const resultColor = isSuccess ? '#39ff14' : '#f55';
        const finalNotes = buildDifficultyNotes(flags.notes, flags.tn || 10, newTN);

        const actor = await fromUuid(readDataString(card, 'actor-uuid'));
        const templateData = {
            actorUuid: readDataString(card, 'actor-uuid'),
            borderColor: resultColor,
            headerColor: resultColor,
            resultColor: resultColor,
            itemName: flags.itemName,
            successTotal: result.total,
            tooltip: generateDiceTooltip(roll, flags.baseModifier, 0, flags.successDieModifier || 0),
            skillDice: result.skillDiceData,
            notes: finalNotes,
            showDamageButton: showButton,
            dmgFormula: finalDmgFormula,
            dmgDisplay: resolveDamageDisplay(finalDmgFormula, actor ?? null),
            minDamage: minDamage,
            adValue: flags.adValue || 0,
            sdIsReroll: flags.rofRerollSD,
            mos: {
                isSuccess: isSuccess,
                hits: skillSuccessCount,
                effect: mosEffectText,
                ...mosChoiceData
            },
            canUseLuck: card.querySelector('.chat-btn-luck') !== null,
            luckValue: 0,
            luckSpent: flags.luckSpent || false
        };

        if (actor) {
            templateData.luckValue = actor.system.stats.luck.value;
            templateData.canUseLuck = actor.system.stats.luck.value > 0;
        }

        const chatContent = await foundry.applications.handlebars.renderTemplate(
            'systems/sla-industries/templates/chat/chat-weapon-rolls.hbs',
            templateData
        );

        await message.update({
            content: chatContent,
            'flags.sla.tn': newTN,
            'flags.sla.notes': finalNotes
        });

        await syncEbbCriticalFlux(message, actor, message.flags?.sla ?? flags, isSuccess, skillSuccessCount);
    } catch (err) {
        console.error('SLA | Error in onChangeDifficulty:', err);
        ui.notifications.error('SLA | Failed to change difficulty. See console for details.');
    }
}
