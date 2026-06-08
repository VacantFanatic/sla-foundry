import { SlaSimpleContentDialog } from '../../apps/sla-simple-dialog.mjs';
import { calculateRollResult, createSLARoll, generateDiceTooltip } from '../../helpers/dice.mjs';
import { shouldShowMosWoundChoice } from '../../helpers/wound-visibility.mjs';
import {
    applySuccessThroughExperience,
    buildSkillDiceResults,
    buildWeaponDamageFormula,
    buildWeaponRollMods,
    computeSuccessDieOutcome,
    computeWeaponSkillDiceCount,
    readWeaponRollFormState,
    resolveWeaponMosOutcome
} from './roll-math.mjs';

async function rerollDieKeepHighest(currentResult) {
    const newRoll = createSLARoll('1d10');
    await newRoll.evaluate();
    const newResult = newRoll.terms[0].results[0].result;
    if (newResult > currentResult) {
        return { result: newResult, rerolled: true };
    }
    return { result: currentResult, rerolled: false };
}

/**
 * @param {{ roll: Roll, flags: { rerollSD?: boolean, rerollAll?: boolean }, notes: string[] }}
 */
async function applyWeaponRofRerolls({ roll, flags, notes }) {
    let rofRerollSD = false;
    const rofRerollSkills = [];

    if (flags.rerollSD || flags.rerollAll) {
        const sdTerm = roll.terms[0];
        const oldValue = sdTerm.results[0].result;
        const outcome = await rerollDieKeepHighest(oldValue);

        rofRerollSD = true;
        if (outcome.rerolled) {
            sdTerm.results[0].result = outcome.result;
            notes.push(`<strong>ROF:</strong> Success Die Improved (${oldValue} ➔ ${outcome.result})`);
        } else {
            notes.push(`<strong>ROF:</strong> Success Die Kept (${oldValue})`);
        }
    }

    if (flags.rerollAll && roll.terms.length > 2) {
        const skillTerm = roll.terms[2];
        let improvedCount = 0;

        for (let i = 0; i < skillTerm.results.length; i++) {
            const oldValue = skillTerm.results[i].result;
            const outcome = await rerollDieKeepHighest(oldValue);
            rofRerollSkills.push(i);

            if (outcome.rerolled) {
                skillTerm.results[i].result = outcome.result;
                improvedCount++;
            }
        }

        if (improvedCount > 0) {
            notes.push(`<strong>ROF:</strong> ${improvedCount} Skill Dice Improved.`);
        } else {
            notes.push(`<strong>ROF:</strong> Skill Dice Kept.`);
        }
    }

    if (rofRerollSD || rofRerollSkills.length > 0) {
        roll._total = roll._evaluateTotal();
    }

    return { rofRerollSD, rofRerollSkills };
}

/**
 * @param {import('../actor-sheet.mjs').SlaActorSheet} sheet
 */
function buildWeaponRollTemplateData(
    sheet,
    {
        item,
        roll,
        baseModifier,
        notesText,
        successDieModifier,
        resultColor,
        sdTotal,
        skillDiceData,
        showDamageButton,
        finalDamageFormula,
        adValue,
        rofRerollSD,
        isSuccess,
        skillSuccessCount,
        mosEffectText,
        mosChoiceData
    }
) {
    const targetActorType = game.user.targets.first()?.actor?.type;
    const showWoundChoice = shouldShowMosWoundChoice({
        hasChoice: Boolean(mosChoiceData?.hasChoice),
        targetActorType,
        enableNpcWoundTracking: game.settings.get('sla-industries', 'enableNPCWoundTracking')
    });

    return {
        actorUuid: sheet.actor.uuid,
        borderColor: resultColor,
        headerColor: resultColor,
        resultColor: resultColor,
        itemName: item.name.toUpperCase(),
        successTotal: sdTotal,
        tooltip: generateDiceTooltip(roll, baseModifier, 0, successDieModifier),
        skillDice: skillDiceData,
        notes: notesText,
        showDamageButton: showDamageButton,
        dmgFormula: finalDamageFormula,
        dmgDisplay: sheet._resolveDamageDisplay(finalDamageFormula),
        minDamage: Number(item.system.minDamage) || 0,
        adValue: adValue,
        sdIsReroll: rofRerollSD,
        mos: {
            isSuccess: isSuccess,
            hits: skillSuccessCount,
            effect: mosEffectText,
            ...mosChoiceData,
            showWoundChoice
        },
        canUseLuck: sheet.actor.system.stats.luck.value > 0,
        luckValue: sheet.actor.system.stats.luck.value,
        luckSpent: false,
        isWeapon: true
    };
}

/**
 * @param {import('../actor-sheet.mjs').SlaActorSheet} sheet
 * @param {Item} item
 * @param {boolean} isMelee
 */
export async function renderAttackDialog(sheet, item, isMelee) {
    if (!sheet._canProceedWithWeaponAttack(item, { requireTarget: true })) return;

    let validModes = {};
    let defaultModeKey = '';

    if (!isMelee && item.system.firingModes) {
        validModes = Object.entries(item.system.firingModes)
            .filter(([, data]) => data.active)
            .reduce((obj, [key, data]) => {
                obj[key] = data;
                return obj;
            }, {});

        if (Object.keys(validModes).length === 0) {
            validModes['single'] = { label: 'Single', active: true, rounds: 1, recoil: 0 };
        }

        defaultModeKey = Object.keys(validModes)[0];
    }

    const { rangePenaltyMsg } = sheet._resolveRangedAttackContext(item, isMelee);

    const templateData = {
        item: item,
        isMelee: isMelee,
        validModes: validModes,
        selectedMode: defaultModeKey,
        rangePenaltyMsg: rangePenaltyMsg,
        recoil: isMelee ? item.system.recoil || 0 : validModes[defaultModeKey]?.recoil || 0,
        canAim: ['pistol', 'rifle'].includes((item.system.skill || '').toLowerCase()),
        aimLimit: (() => {
            const sKey = (item.system.skill || '').toLowerCase();
            const sItem = sheet.actor.items.find((i) => i.type === 'skill' && i.name.toLowerCase() === sKey);
            return sItem ? sItem.system.rank || 0 : 0;
        })()
    };

    const content = await foundry.applications.handlebars.renderTemplate(
        'systems/sla-industries/templates/dialogs/attack-dialog.hbs',
        templateData
    );

    await new SlaSimpleContentDialog({
        title: `Attack: ${item.name} ${rangePenaltyMsg}`,
        contentHtml: content,
        width: 520,
        classes: ['sla-dialog-window', 'dialog'],
        actionLabel: 'ROLL',
        onConfirm: (root) => void processWeaponRoll(sheet, item, root, isMelee)
    }).render(true);
}

/**
 * @param {import('../actor-sheet.mjs').SlaActorSheet} sheet
 * @param {Item} item
 * @param {HTMLElement | HTMLFormElement} html
 * @param {boolean} isMelee
 */
export async function processWeaponRoll(sheet, item, html, isMelee) {
    const root = html?.jquery ? html[0] : html;
    const form = root instanceof HTMLFormElement ? root : root?.querySelector?.('form');
    if (!form) return;

    const weapon = sheet.actor.items.get(item.id) ?? item;
    if (!sheet._canProceedWithWeaponAttack(weapon, { requireTarget: true })) return;
    item = weapon;

    const statKey = isMelee ? 'str' : 'dex';
    const statValue = sheet.actor.system.stats[statKey]?.total ?? sheet.actor.system.stats[statKey]?.value ?? 0;
    const strValue = Number(sheet.actor.system.stats.str?.total ?? sheet.actor.system.stats.str?.value ?? 0);
    const rank = sheet._resolveCombatSkillRank(item.system.skill);
    const formState = readWeaponRollFormState(form);
    const mods = buildWeaponRollMods(formState);

    const notes = [];
    const flags = { rerollSD: false, rerollAll: false };

    const totalAim = mods.aimSd + mods.aimAuto;
    if (totalAim > rank) {
        ui.notifications.warn(`Total Aiming rounds (${totalAim}) cannot exceed Skill Rank (${rank}).`);
        return;
    }

    if (sheet.actor.system.conditions?.prone) mods.allDice -= 1;
    if (sheet.actor.system.conditions?.stunned) mods.allDice -= 1;

    if (mods.aimSd > 0) mods.successDie += mods.aimSd;
    if (mods.aimAuto > 0) mods.autoSkillSuccesses += mods.aimAuto;

    const rangedContext = sheet._resolveRangedAttackContext(item, isMelee);

    if (isMelee) {
        sheet._applyMeleeModifiers(form, strValue, mods);

        if (mods.combatDef > 0) {
            notes.push(`Defended (Combat Def: -${mods.combatDef})`);
        }
        if (mods.acroDef > 0) {
            const pen = mods.acroDef * 2;
            notes.push(`Defended (Acrobatics: -${pen})`);
        }
        if (mods.targetProne) {
            mods.successDie += 2;
            notes.push(`Target Prone (+2 SD)`);
        }

        if (mods.reservedDice > rank) {
            ui.notifications.warn(
                `Cannot reserve more dice (${mods.reservedDice}) than Skill Rank (${rank}). Reduced to ${rank}.`
            );
            mods.reservedDice = rank;
        }
        if (mods.reservedDice > 0) {
            notes.push(`Reserved ${mods.reservedDice} Dice.`);
        }
    } else {
        const canFire = await sheet._applyRangedModifiers(item, form, mods, notes, flags, {
            forceLongRange: rangedContext.isLongRange
        });
        if (canFire === false) return;
    }

    const penalty = sheet.actor.system.wounds.penalty || 0;
    if (game.settings.get('sla-industries', 'enableAutomaticWoundPenalties')) {
        mods.allDice -= penalty;
    }

    if (item.system.powersuitAttack) {
        const attackPenalty = Number(item.system.attackPenalty) || 0;
        if (attackPenalty !== 0) {
            mods.allDice += attackPenalty;
            if (attackPenalty < 0) notes.push(`Powersuit Attack (${attackPenalty})`);
            else notes.push(`Powersuit Attack (+${attackPenalty})`);
        }
    }

    const baseModifier = statValue + rank + mods.allDice;
    const skillDiceCount = computeWeaponSkillDiceCount(rank, mods);
    const rollFormula = `1d10 + ${skillDiceCount}d10`;
    const roll = createSLARoll(rollFormula);
    await roll.evaluate();

    const TN = 10;
    calculateRollResult(roll, baseModifier, TN, {
        autoSkillSuccesses: mods.aimAuto || 0,
        successDieModifier: mods.successDie
    });

    const { rofRerollSD, rofRerollSkills } = await applyWeaponRofRerolls({ roll, flags, notes });

    const sdRaw = roll.terms[0].results[0].result;
    const { sdTotal, isBaseSuccess } = computeSuccessDieOutcome({
        sdRaw,
        baseModifier,
        successDieModifier: mods.successDie,
        targetNumber: TN
    });

    const { skillDiceData, skillSuccessCount } = buildSkillDiceResults({
        roll,
        baseModifier,
        targetNumber: TN,
        autoSuccesses: mods.autoSkillSuccesses,
        rerollIndexes: rofRerollSkills,
        includeRerollFlag: true
    });

    const ste = applySuccessThroughExperience({ isBaseSuccess, skillSuccessCount, threshold: 4 });
    if (ste.note) notes.push(ste.note);

    const isSuccess = ste.isSuccess;
    const successThroughExperience = ste.successThroughExperience;
    const resultColor = isSuccess ? '#39ff14' : '#f55';

    const { mosDamageBonus, mosEffectText, mosChoiceData, shouldApplyHeadWound } = resolveWeaponMosOutcome({
        isSuccess,
        successThroughExperience,
        skillSuccessCount
    });
    if (shouldApplyHeadWound) {
        await sheet._applyHeadshotSideEffect(notes);
    }

    const baseDmg = String(item.system.damage || item.system.dmg || '0');
    const totalMod = mods.damage + mosDamageBonus;
    const finalDmgFormula = buildWeaponDamageFormula(baseDmg, totalMod);
    const showButton = isSuccess && finalDmgFormula && finalDmgFormula !== '0';

    let adValue = Number(item.system.ad) || 0;
    if (item.system.powersuitAttack) {
        const adFromStrMinus = Number(item.system.adFromStrMinus) || 0;
        if (adFromStrMinus > 0) {
            adValue = Math.max(0, strValue - adFromStrMinus);
        }
    }

    const notesText = notes.join(' ');
    const templateData = buildWeaponRollTemplateData(sheet, {
        item,
        roll,
        baseModifier,
        notesText,
        successDieModifier: mods.successDie,
        resultColor,
        sdTotal,
        skillDiceData,
        showDamageButton: showButton,
        finalDamageFormula: finalDmgFormula,
        adValue,
        rofRerollSD,
        isSuccess,
        skillSuccessCount,
        mosEffectText,
        mosChoiceData
    });

    const chatContent = await foundry.applications.handlebars.renderTemplate(
        'systems/sla-industries/templates/chat/chat-weapon-rolls.hbs',
        templateData
    );

    roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: sheet.actor }),
        content: chatContent,
        flags: {
            sla: sheet._buildSlaRollFlags({
                baseModifier: baseModifier,
                itemName: item.name.toUpperCase(),
                notes: notesText,
                tn: TN,
                extra: {
                    rofRerollSD: rofRerollSD,
                    rofRerollSkills: rofRerollSkills,
                    targets: Array.from(game.user.targets).map((t) => t.document.uuid),
                    damageBase: baseDmg,
                    damageMod: mods.damage,
                    adValue: adValue,
                    autoSkillSuccesses: mods.autoSkillSuccesses,
                    successDieModifier: mods.successDie,
                    isWeapon: true
                }
            })
        }
    });
}
