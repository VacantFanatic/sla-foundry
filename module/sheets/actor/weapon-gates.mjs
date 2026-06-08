import { SLAChat } from '../../helpers/chat.mjs';
import { calculateRangePenalty } from '../../helpers/modifiers.mjs';
import { buildWeaponDamageFormula, computeMeleeStrDamageModifier } from './roll-math.mjs';

const UNEQUIPPED_WEAPON_LINES = [
    'That hardware is still stowed—you need it in hand, not in inventory. Equip it first, operative.',
    "You can't mug a Carrien with pocket lint. Equip the weapon, then we'll talk dice.",
    "Bane's watching, and even he expects the barrel to leave the holster before you roll. Equip it.",
    "Nice commitment to the bit, but mime combat doesn't bypass armor. Toggle that weapon to equipped."
];

export function requiresWeaponEquippedForAttack(actor) {
    return actor.type === 'character';
}

export function notifyUnequippedWeaponHumor() {
    ui.notifications.info(UNEQUIPPED_WEAPON_LINES[Math.floor(Math.random() * UNEQUIPPED_WEAPON_LINES.length)]);
}

export function canProceedWithWeaponAttack(sheet, item, { requireTarget = false } = {}) {
    if (requiresWeaponEquippedForAttack(sheet.actor) && !item.system.equipped) {
        notifyUnequippedWeaponHumor();
        return false;
    }

    if (
        requireTarget &&
        game.settings.get('sla-industries', 'enableTargetRequiredFeatures') &&
        game.user.targets.size === 0
    ) {
        ui.notifications.warn('You must select a target to attack.');
        return false;
    }

    return true;
}

export function getAmmoDamageModifierForWeapon(actor, item) {
    if (!item?.system?.magazineId || !actor) return 0;
    const magazine = actor.items.get(item.system.magazineId);
    if (!magazine) return 0;
    const ammoType = magazine.system.ammoType || 'standard';
    const configMods = CONFIG.SLA?.ammoModifiers?.[ammoType];
    return configMods ? Number(configMods.damage) || 0 : 0;
}

export function resolveWeaponAdForDamageRoll(actor, item) {
    let adValue = Number(item.system.ad) || 0;
    if (item.system.powersuitAttack) {
        const strValue = Number(actor.system.stats.str?.total ?? actor.system.stats.str?.value ?? 0);
        const adFromStrMinus = Number(item.system.adFromStrMinus) || 0;
        if (adFromStrMinus > 0) {
            adValue = Math.max(0, strValue - adFromStrMinus);
        }
    }
    return adValue;
}

export function getActorTokenForRangeCheck(sheet) {
    return (
        sheet.actor.token?.object ||
        sheet.token ||
        (sheet.actor.getActiveTokens().length > 0 ? sheet.actor.getActiveTokens()[0] : null)
    );
}

export function resolveRangedAttackContext(sheet, item, isMelee) {
    const context = { isLongRange: false, rangePenaltyMsg: '' };
    if (
        isMelee ||
        !game.settings.get('sla-industries', 'enableTargetRequiredFeatures') ||
        game.user.targets.size === 0
    ) {
        return context;
    }

    const token = getActorTokenForRangeCheck(sheet);
    if (!token) return context;

    const target = game.user.targets.first();
    const maxRange = parseInt(item.system.range || '10') || 10;
    const rangeData = calculateRangePenalty(token, target, maxRange);

    context.isLongRange = rangeData.isLongRange;
    context.rangePenaltyMsg = rangeData.penaltyMsg;
    return context;
}

/**
 * @param {import('../actor-sheet.mjs').SlaActorSheet} sheet
 * @param {HTMLElement} anchor
 */
export async function executeCombatLoadoutDamageRoll(sheet, anchor) {
    const row = anchor.closest('.item');
    const itemId = row?.dataset?.itemId;
    const item = itemId ? sheet.actor.items.get(itemId) : null;
    if (!item || (item.type !== 'weapon' && item.type !== 'explosive')) return;
    if (!sheet.actor.isOwner) {
        ui.notifications.warn('You do not own this actor.');
        return;
    }
    if (!canProceedWithWeaponAttack(sheet, item, { requireTarget: false })) return;

    const strValue = Number(sheet.actor.system.stats.str?.total ?? sheet.actor.system.stats.str?.value ?? 0);
    let damageMod = 0;

    if (item.type === 'weapon') {
        const isMelee = (item.system.attackType || 'melee') === 'melee';
        if (isMelee) damageMod += computeMeleeStrDamageModifier(strValue);
        damageMod += getAmmoDamageModifierForWeapon(sheet.actor, item);
    }

    const rawBase = item.system.damage || item.system.dmg || '0';
    const rollFormula = buildWeaponDamageFormula(String(rawBase), damageMod);
    const minDamage = Number(item.system.minDamage) || 0;
    const adValue =
        item.type === 'explosive' ? Number(item.system.ad) || 0 : resolveWeaponAdForDamageRoll(sheet.actor, item);

    const flavorText =
        item.type === 'explosive'
            ? `<span style="color:#D05E1A">${item.name}</span> — Explosive damage`
            : `<span style="color:#D05E1A">${item.name}</span> — Standard Damage Roll`;

    const parentTargets = Array.from(game.user.targets).map((t) => t.document.uuid);
    const rollData = typeof item.getRollData === 'function' ? item.getRollData() : sheet.actor.getRollData();

    try {
        await SLAChat.executeStandardDamageRoll({
            actor: sheet.actor,
            rollData: rollData ?? sheet.actor.getRollData(),
            rollFormula,
            adValue,
            minDamage,
            flavorText,
            parentTargets
        });
    } catch (err) {
        console.error('SLA | Combat loadout damage roll failed:', err);
        ui.notifications.error('SLA | Failed to roll damage. See console for details.');
    }
}
