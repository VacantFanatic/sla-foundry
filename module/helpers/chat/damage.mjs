import {
    applyPvModifierToArmor,
    buildUndoDamageUpdates,
    buildWoundClearUpdates,
    computeHealHpBounds,
    computeMitigatedDamage
} from './pure.mjs';
import { applyResistanceToPv, computeShieldPieceBonus } from '../../documents/derived/encumbrance.mjs';

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
    pvMod = 0,
    ammoName = null,
    attackType = 'melee',
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
            await applyEbbOutcomeToActor(actor, finalTotal, adValue, {
                isHeal,
                removeWoundsCount,
                pvMod,
                ammoName,
                attackType
            });
            flavor += `<br/><span style="color:#9cf;font-size:0.9em;">${game.i18n.localize('SLA.EbbAppliedToCaster')}</span>`;
        } catch (err) {
            console.error('SLA | Ebb self-apply:', err);
            flavor += `<br/><span style="color:#f66;font-size:0.9em;">${game.i18n.localize('SLA.EbbApplyToCasterFailed')}</span>`;
        }
    }

    let showShieldCraftOption = true;
    if (parentTargets.length > 0) {
        const targetActor = await resolveActorFromUuid(parentTargets[0]);
        if (targetActor) {
            showShieldCraftOption = actorHasActiveShield(targetActor);
        }
    }

    const templateData = {
        damageTotal: finalTotal,
        adValue,
        pvMod,
        ammoName,
        attackType,
        flavor,
        isHeal,
        hideApplyButtons,
        showShieldCraftOption,
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
                ebbRemoveWoundsCount: Math.max(0, Math.min(6, Math.floor(Number(removeWoundsCount) || 0))),
                pvMod,
                ammoName,
                attackType
            }
        }
    });

    if (autoApplyWound && parentTargets.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        const targetUuid = parentTargets[0];
        if (targetUuid) {
            // Auto-apply has no chat card for a GM to check "Shield Craft Succeeded" on, so a
            // shield never blocks an auto-applied hit — use the ordinary Apply Damage button
            // instead if the shield should count.
            await applyDamageToTarget(finalTotal, adValue, targetUuid, pvMod, ammoName, attackType, false);
        }
    }
}

export async function resolveActorFromUuid(targetUuid) {
    const doc = await fromUuid(targetUuid);
    if (!doc) return null;
    // targetUuid may be a Token UUID (live play, from game.user.targets) or a plain
    // Actor UUID (e.g. a world actor with no token/scene involved) -- accept both.
    return doc instanceof Actor ? doc : (doc.actor ?? null);
}

function actorHasActiveShield(actor) {
    // Unlike computeArmorMitigation's mitigation math (which treats all NPC armor as equipped),
    // this checkbox's visibility must follow the shield's actual equip toggle on both actor
    // types -- a GM can unequip an NPC's shield same as a PC's, and the checkbox does nothing
    // for a shield that isn't equipped.
    return actor.items.some((i) => i.type === 'armor' && i.system.isShield && i.system.equipped);
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
    if (!clearedCount) return { clearedCount: 0, clearedKeys: [] };
    await actor.update(updates);
    const clearedKeys = Object.keys(updates).map((k) => k.replace('system.wounds.', ''));
    return { clearedCount, clearedKeys };
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

export async function applyEbbOutcomeToActor(
    actor,
    rawAmount,
    ad,
    {
        isHeal,
        removeWoundsCount = 0,
        pvMod = 0,
        ammoName = null,
        attackType = 'melee',
        shieldCraftSuccess = false,
        ignorePV = false
    }
) {
    const n = Math.max(0, Math.min(6, Math.floor(Number(removeWoundsCount) || 0)));
    let woundsCleared = [];

    if (isHeal) {
        const { finalHeal, hpData } = await applyHpHeal(actor, rawAmount);
        if (n > 0) {
            ({ clearedKeys: woundsCleared } = await clearNWoundsOnActor(actor, n));
        }
        await postHealResultChat({ victim: actor, rawHeal: rawAmount, finalHeal, hpData, woundsCleared });
    } else {
        if (n > 0) {
            ({ clearedKeys: woundsCleared } = await clearNWoundsOnActor(actor, n));
        }
        await applyDamageToVictim(
            actor,
            rawAmount,
            ad,
            pvMod,
            ammoName,
            attackType,
            shieldCraftSuccess,
            ignorePV,
            woundsCleared
        );
    }
}

export async function postHealResultChat({ victim, rawHeal, finalHeal, hpData, woundsCleared = [] }) {
    const undo = {
        kind: 'heal',
        victimUuid: victim.uuid,
        appliedBy: game.user.id,
        appliedAt: Date.now(),
        hp: hpData,
        armor: null,
        wounds: woundsCleared.length ? { cleared: woundsCleared } : null,
        undone: false,
        undoneBy: null,
        undoneAt: null
    };

    const content = await foundry.applications.handlebars.renderTemplate(
        'systems/sla-industries/templates/chat/chat-damage-result.hbs',
        {
            victimName: victim.name,
            rawDamage: rawHeal,
            targetPV: 0,
            finalDamage: finalHeal,
            hpData,
            armorData: null,
            isHeal: true,
            undo
        }
    );
    await ChatMessage.create({ content, flags: { sla: { undo } } });
}

/**
 * Degrades one armor-type item's own Resistance pool by AD and returns its effective PV
 * contribution after degradation, using the shared full/half/zero resistance rule.
 * @param {object} item
 * @param {number} ad
 * @param {number} basePv
 */
async function degradeArmorItemResistance(item, ad, basePv) {
    const currentRes = item.system.resistance?.value || 0;
    const maxRes = item.system.resistance?.max || 10;
    const newRes = Math.max(0, currentRes - ad);
    await item.update({ 'system.resistance.value': newRes });

    const effectivePv = applyResistanceToPv(basePv, { value: newRes, max: maxRes });

    return { effectivePv, resistanceUpdate: { current: currentRes, new: newRes, ad, itemUuid: item.uuid } };
}

/**
 * @param {object} victim
 * @param {number} ad
 * @param {number} [pvMod]
 * @param {'melee'|'ranged'} [attackType]
 * @param {boolean} [shieldCraftSuccess] - Whether the wielder's Shield Craft roll succeeded
 *   against this specific attack. Equipped shields only contribute when this is true; `equipped`
 *   alone only means "currently carried/raised," not "blocked this hit."
 * @param {boolean} [ignorePV] - Whether this hit bypasses the target's armor PV entirely (e.g.
 *   Rift Claws/Teeth, p. 202). When true, armor and shields are not consulted at all -- the hit
 *   doesn't interact with them, so shield/armor Resistance is not degraded either.
 */
export async function computeArmorMitigation(
    victim,
    ad,
    pvMod = 0,
    attackType = 'melee',
    shieldCraftSuccess = false,
    ignorePV = false
) {
    if (ignorePV) {
        return { targetPV: 0, rawPv: 0, effectivePV: 0, armorData: null };
    }

    const isEquipped = (i) => victim.type === 'npc' || i.system.equipped;
    const armorItems = victim.items.filter((i) => i.type === 'armor' && isEquipped(i));
    const bodyArmorItems = armorItems.filter((i) => !i.system.isShield);
    const shieldItems = shieldCraftSuccess ? armorItems.filter((i) => i.system.isShield) : [];

    let armorItem = null;
    let bodyArmorPv = 0;
    for (const item of bodyArmorItems) {
        const pv = item.system.pv || 0;
        if (!armorItem || pv > bodyArmorPv) {
            armorItem = item;
            bodyArmorPv = pv;
        }
    }

    let targetPV = 0;
    if (armorItem) {
        targetPV = bodyArmorPv;
    } else if (victim.system.armor?.pv) {
        targetPV = victim.system.armor.pv || 0;
    }

    const rawPv = targetPV;
    targetPV = applyPvModifierToArmor(targetPV, pvMod);

    const contributions = [];
    let effectivePV = targetPV;

    // Shields whose PV for this attackType is actually nonzero -- these are "up" and blocking.
    const activeShields = shieldItems.filter((shield) => {
        const shieldBasePv = attackType === 'ranged' ? shield.system.pvRanged || 0 : shield.system.pvMelee || 0;
        return shieldBasePv > 0;
    });

    if (activeShields.length > 0) {
        // Per the tabletop rule ("all AD will be inflicted against [the shield]"), when a shield
        // is actively blocking this hit, 100% of the AD routes to the shield(s) and the wearer's
        // body armor Resistance is untouched -- it is never split between both pools.
        for (const shield of activeShields) {
            const shieldBasePv = attackType === 'ranged' ? shield.system.pvRanged || 0 : shield.system.pvMelee || 0;
            if (ad > 0) {
                const { effectivePv, resistanceUpdate } = await degradeArmorItemResistance(shield, ad, shieldBasePv);
                effectivePV += effectivePv;
                contributions.push({
                    kind: 'shield',
                    name: shield.name,
                    ...resistanceUpdate,
                    effectivePV: effectivePv
                });
            } else {
                // No AD this hit to degrade further, but a shield already worn down by prior hits
                // should still reflect its current resistance state.
                effectivePV += computeShieldPieceBonus(shield.system, attackType);
            }
        }
    } else if (armorItem && ad > 0) {
        const { effectivePv, resistanceUpdate } = await degradeArmorItemResistance(armorItem, ad, targetPV);
        effectivePV = effectivePv;
        contributions.push({ kind: 'armor', name: armorItem.name, ...resistanceUpdate, effectivePV: effectivePv });
    }

    const armorData = contributions.length ? contributions : null;

    return { targetPV, rawPv, effectivePV, armorData };
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

export async function postDamageResultChat({
    victim,
    rawDamage,
    targetPV,
    rawPv,
    effectivePV,
    pvMod = 0,
    ammoName = null,
    finalDamage,
    hpData,
    armorData,
    woundsCleared = []
}) {
    const undo = {
        kind: 'damage',
        victimUuid: victim.uuid,
        appliedBy: game.user.id,
        appliedAt: Date.now(),
        hp: hpData,
        armor: armorData
            ? armorData.map((a) => ({
                  kind: a.kind,
                  itemUuid: a.itemUuid,
                  resistance: { old: a.current, new: a.new }
              }))
            : null,
        wounds: woundsCleared.length ? { cleared: woundsCleared } : null,
        undone: false,
        undoneBy: null,
        undoneAt: null
    };

    const content = await foundry.applications.handlebars.renderTemplate(
        'systems/sla-industries/templates/chat/chat-damage-result.hbs',
        {
            victimName: victim.name,
            rawDamage: rawDamage,
            targetPV: targetPV,
            rawPv: rawPv,
            effectivePV: effectivePV,
            pvMod: pvMod,
            ammoName: ammoName,
            finalDamage: finalDamage,
            hpData: hpData,
            armorData: armorData,
            undo
        }
    );

    await ChatMessage.create({ content, flags: { sla: { undo } } });
}

export async function applyDamageToVictim(
    victim,
    rawDamage,
    ad,
    pvMod = 0,
    ammoName = null,
    attackType = 'melee',
    shieldCraftSuccess = false,
    ignorePV = false,
    woundsCleared = []
) {
    const { targetPV, rawPv, effectivePV, armorData } = await computeArmorMitigation(
        victim,
        ad,
        pvMod,
        attackType,
        shieldCraftSuccess,
        ignorePV
    );
    const { finalDamage, hpData } = await applyHpDamage(victim, rawDamage, effectivePV);
    await postDamageResultChat({
        victim,
        rawDamage,
        targetPV,
        rawPv,
        effectivePV,
        pvMod,
        ammoName,
        finalDamage,
        hpData,
        armorData,
        woundsCleared
    });
}

export async function applyDamageToTarget(
    rawDamage,
    ad,
    targetUuid,
    pvMod = 0,
    ammoName = null,
    attackType = 'melee',
    shieldCraftSuccess = false,
    ignorePV = false
) {
    const victim = await resolveActorFromUuid(targetUuid);
    if (!victim) {
        console.warn('SLA | Auto-apply: Target not found', targetUuid);
        return;
    }
    await applyDamageToVictim(victim, rawDamage, ad, pvMod, ammoName, attackType, shieldCraftSuccess, ignorePV);
}

/**
 * Reverses a previously-applied damage/heal result recorded in a ChatMessage's
 * `flags.sla.undo`, restoring the victim's HP, any degraded armor/shield item resistance, and
 * any Ebb-cleared wound fields — but only if nothing else has changed those values since the
 * original application (see buildUndoDamageUpdates). Never partially reverts.
 *
 * @param {ChatMessage} message
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function undoDamageApplication(message) {
    const undo = message?.flags?.sla?.undo;
    if (!undo) return { ok: false, reason: 'no-undo-data' };
    if (undo.undone) return { ok: false, reason: 'already-undone' };

    const victim = await resolveActorFromUuid(undo.victimUuid);
    if (!victim) return { ok: false, reason: 'actor-deleted' };

    const itemResistances = {};
    for (const entry of undo.armor ?? []) {
        const item = await fromUuid(entry.itemUuid);
        if (!item) return { ok: false, reason: 'armor-item-missing' };
        itemResistances[entry.itemUuid] = item.system.resistance?.value ?? null;
    }

    const currentState = {
        hpValue: victim.system.hp.value,
        itemResistances,
        wounds: victim.system.wounds ?? {}
    };

    const { ok, reason, actorUpdates, itemUpdates } = buildUndoDamageUpdates(undo, currentState);
    if (!ok) return { ok: false, reason };

    if (Object.keys(actorUpdates).length) {
        await victim.update(actorUpdates);
    }
    for (const [itemUuid, update] of Object.entries(itemUpdates)) {
        const item = await fromUuid(itemUuid);
        if (item) await item.update(update);
    }

    await message.update({
        'flags.sla.undo.undone': true,
        'flags.sla.undo.undoneBy': game.user.id,
        'flags.sla.undo.undoneAt': Date.now()
    });

    return { ok: true };
}
