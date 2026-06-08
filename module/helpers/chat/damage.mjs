import { buildWoundClearUpdates, computeHealHpBounds, computeMitigatedDamage } from './pure.mjs';

export function resolveDamageDisplay(formula, actor = null) {
    const formulaStr = String(formula ?? '0').trim();
    if (!formulaStr || formulaStr === '0') return '0';
    if (formulaStr.includes('d')) return formulaStr;

    try {
        const rollData = actor?.getRollData?.() ?? {};
        const replaced = Roll.replaceFormulaData(formulaStr, rollData);
        const resolved = Math.round(Number(Function('"use strict";return (' + replaced + ')')()));
        return Number.isFinite(resolved) ? String(Math.max(0, resolved)) : formulaStr;
    } catch (_err) {
        return formulaStr;
    }
}

/**
 * @param {object} options
 */
export async function executeStandardDamageRoll({
    actor,
    rollFormula,
    rollData = null,
    adValue = 0,
    minDamage = 0,
    flavorText = 'Standard Damage Roll',
    parentTargets = [],
    autoApplyWound = false,
    isHeal = false,
    removeWoundsCount = 0,
    ebbTarget = 'enemy'
}) {
    if (!actor) {
        ui.notifications.error('SLA | Actor not found.');
        return;
    }
    if (!actor.isOwner) {
        ui.notifications.warn('You do not own this actor.');
        return;
    }

    const formula = String(rollFormula ?? '0').trim();
    if (!formula || formula === '0') {
        ui.notifications.warn('No damage formula to roll.');
        return;
    }

    const data = rollData ?? actor.getRollData?.() ?? {};
    let roll = new Roll(formula, data);
    await roll.evaluate();

    const minDmg = Math.max(0, Number(minDamage) || 0);
    let finalTotal = Math.max(0, roll.total);
    let flavor = flavorText;

    if (finalTotal < minDmg) {
        finalTotal = minDmg;
        if (minDmg > 0) {
            flavor += `<br/><span style="color:orange; font-size:0.9em;">(Raised to Min Damage ${minDmg})</span>`;
        }
        if (roll._total !== undefined) roll._total = minDmg;
    }

    const hideApplyButtons = ebbTarget === 'self';
    if (hideApplyButtons && !autoApplyWound) {
        try {
            await applyEbbOutcomeToActor(actor, finalTotal, adValue, { isHeal, removeWoundsCount });
            flavor += `<br/><span style="color:#9cf;font-size:0.9em;">${game.i18n.localize('SLA.EbbAppliedToCaster')}</span>`;
        } catch (err) {
            console.error('SLA | Ebb self-apply:', err);
            flavor += `<br/><span style="color:#f66;font-size:0.9em;">${game.i18n.localize('SLA.EbbApplyToCasterFailed')}</span>`;
        }
    }

    const templateData = {
        damageTotal: finalTotal,
        adValue,
        flavor,
        isHeal,
        hideApplyButtons,
        actorUuid: actor.uuid,
        ebbTarget,
        removeWoundsCount: Math.max(0, Math.min(6, Math.floor(Number(removeWoundsCount) || 0)))
    };

    const content = await foundry.applications.handlebars.renderTemplate(
        'systems/sla-industries/templates/chat/chat-damage.hbs',
        templateData
    );

    await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        content,
        flags: {
            sla: {
                targets: parentTargets,
                autoApply: autoApplyWound,
                ebbCasterUuid: actor.uuid,
                ebbTarget,
                ebbIsHeal: isHeal,
                ebbRemoveWoundsCount: Math.max(0, Math.min(6, Math.floor(Number(removeWoundsCount) || 0)))
            }
        }
    });

    if (autoApplyWound && parentTargets.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        const targetUuid = parentTargets[0];
        if (targetUuid) {
            await applyDamageToTarget(finalTotal, adValue, targetUuid);
        }
    }
}

export async function resolveActorFromUuid(targetUuid) {
    const token = await fromUuid(targetUuid);
    return token?.actor ?? null;
}

export async function resolveVictimForApplyDamage({ targetUuid, type }) {
    if (targetUuid) {
        return await resolveActorFromUuid(targetUuid);
    }

    if (type === 'selected') {
        const selectedActor = canvas.tokens.controlled[0]?.actor;
        if (!selectedActor) {
            ui.notifications.warn('No token selected.');
            return null;
        }
        return selectedActor;
    }

    const targetActor = game.user.targets.first()?.actor;
    if (!targetActor) {
        ui.notifications.warn('No target designated.');
        return null;
    }
    return targetActor;
}

export async function resolveEbbFormulaVictim(rollingActor, ebbTarget, { type, targetUuid, parentTargets = [] } = {}) {
    if (ebbTarget === 'self') {
        if (!rollingActor) {
            ui.notifications.warn(game.i18n.localize('SLA.EbbCasterNotFound'));
            return null;
        }
        return rollingActor;
    }

    if (targetUuid) {
        return await resolveActorFromUuid(targetUuid);
    }

    if (ebbTarget === 'ally') {
        if (type === 'target') {
            const t = game.user.targets.first();
            return t?.actor ?? null;
        }
        const selectedActor = canvas.tokens.controlled[0]?.actor;
        if (!selectedActor) {
            ui.notifications.warn(game.i18n.localize('SLA.EbbNoAllySelected'));
            return null;
        }
        return selectedActor;
    }

    if (parentTargets.length > 0) {
        const a = await resolveActorFromUuid(parentTargets[0]);
        if (a) return a;
    }

    return await resolveVictimForApplyDamage({ targetUuid: null, type: type || 'target' });
}

export async function clearNWoundsOnActor(actor, count) {
    const { updates, clearedCount } = buildWoundClearUpdates(actor?.system?.wounds, count);
    if (!clearedCount) return 0;
    await actor.update(updates);
    return clearedCount;
}

export async function applyHpHeal(victim, rawHeal) {
    const currentHP = victim.system.hp.value;
    const maxHP = victim.system.hp.max ?? currentHP;
    const { newHP, finalHeal } = computeHealHpBounds(currentHP, maxHP, rawHeal);
    await victim.update({ 'system.hp.value': newHP });
    return {
        finalHeal,
        hpData: { old: currentHP, new: newHP }
    };
}

export async function applyEbbOutcomeToActor(actor, rawAmount, ad, { isHeal, removeWoundsCount = 0 }) {
    if (isHeal) {
        const { finalHeal, hpData } = await applyHpHeal(actor, rawAmount);
        await postHealResultChat({ victim: actor, rawHeal: rawAmount, finalHeal, hpData });
    } else {
        await applyDamageToVictim(actor, rawAmount, ad);
    }
    const n = Math.max(0, Math.min(6, Math.floor(Number(removeWoundsCount) || 0)));
    if (n > 0) {
        await clearNWoundsOnActor(actor, n);
    }
}

export async function postHealResultChat({ victim, rawHeal, finalHeal, hpData }) {
    const content = await foundry.applications.handlebars.renderTemplate(
        'systems/sla-industries/templates/chat/chat-damage-result.hbs',
        {
            victimName: victim.name,
            rawDamage: rawHeal,
            targetPV: 0,
            finalDamage: finalHeal,
            hpData,
            armorData: null,
            isHeal: true
        }
    );
    ChatMessage.create({ content });
}

export async function computeArmorMitigation(victim, ad) {
    const armorItem = victim.items.find((i) => i.type === 'armor' && i.system.equipped);

    let targetPV = 0;
    let armorData = null;

    if (armorItem) {
        targetPV = armorItem.system.pv || 0;
    } else if (victim.system.armor?.pv) {
        targetPV = victim.system.armor.pv || 0;
    }

    let effectivePV = targetPV;
    if (armorItem && ad > 0) {
        const currentRes = armorItem.system.resistance?.value || 0;
        const maxRes = armorItem.system.resistance?.max || 10;
        const newRes = Math.max(0, currentRes - ad);
        await armorItem.update({ 'system.resistance.value': newRes });

        if (newRes <= 0) effectivePV = 0;
        else if (newRes < maxRes / 2) effectivePV = Math.floor(targetPV / 2);
        else effectivePV = targetPV;

        armorData = {
            current: currentRes,
            new: newRes,
            ad: ad,
            effectivePV: effectivePV
        };
    }

    return { targetPV, effectivePV, armorData };
}

export async function applyHpDamage(victim, rawDamage, effectivePV) {
    const finalDamage = computeMitigatedDamage(rawDamage, effectivePV);
    const currentHP = victim.system.hp.value;
    const newHP = currentHP - finalDamage;
    await victim.update({ 'system.hp.value': newHP });

    return {
        finalDamage,
        hpData: {
            old: currentHP,
            new: newHP
        }
    };
}

export async function postDamageResultChat({ victim, rawDamage, targetPV, finalDamage, hpData, armorData }) {
    const content = await foundry.applications.handlebars.renderTemplate(
        'systems/sla-industries/templates/chat/chat-damage-result.hbs',
        {
            victimName: victim.name,
            rawDamage: rawDamage,
            targetPV: targetPV,
            finalDamage: finalDamage,
            hpData: hpData,
            armorData: armorData
        }
    );

    ChatMessage.create({ content });
}

export async function applyDamageToVictim(victim, rawDamage, ad) {
    const { targetPV, effectivePV, armorData } = await computeArmorMitigation(victim, ad);
    const { finalDamage, hpData } = await applyHpDamage(victim, rawDamage, effectivePV);
    await postDamageResultChat({
        victim,
        rawDamage,
        targetPV,
        finalDamage,
        hpData,
        armorData
    });
}

export async function applyDamageToTarget(rawDamage, ad, targetUuid) {
    const victim = await resolveActorFromUuid(targetUuid);
    if (!victim) {
        console.warn('SLA | Auto-apply: Target not found', targetUuid);
        return;
    }
    await applyDamageToVictim(victim, rawDamage, ad);
}
