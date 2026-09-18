import { countWounds, resolveStunnedFromHeadWound, shouldSuppressBleeding } from '../derived/wounds.mjs';

/**
 * Apply/remove Bleeding from wound count and Frother exception (sheet toggles re-synced by the caller).
 * @param {Actor} actor
 */
export async function syncBleedingToWounds(actor) {
    const woundCount = countWounds(actor.system.wounds);
    const hasBleeding = actor.effects.some((e) => e.statuses.has('bleeding'));
    const species = actor.items.find((i) => i.type === 'species');
    const shouldBleed = woundCount > 0 && !shouldSuppressBleeding(species?.name, woundCount);
    if (shouldBleed && !hasBleeding) {
        await actor.toggleStatusEffect('bleeding', { active: true });
    } else if (!shouldBleed && hasBleeding) {
        await actor.toggleStatusEffect('bleeding', { active: false });
    }
}

/**
 * Handle Side-Effects of Wounds (Stunned, Immobile, Bleeding)
 * @param {Actor} actor
 * @param {Set<string>} changedWoundFields - which wound location fields changed in this update
 */
export async function handleWoundEffects(actor, changedWoundFields) {
    // We need the *full* current state of wounds, merging the update with existing data
    // However, 'actor.system.wounds' is already updated in memory by the time _onUpdate fires?
    // ACTUALLY: In _onUpdate, 'actor.system' IS already updated to the new state.
    // 'changed' only contains the diff.

    // Ensure wounds object exists
    if (!actor.system.wounds) actor.system.wounds = {};
    const w = actor.system.wounds;
    const effectsToToggle = [];

    // Helper to check if effect exists
    const hasEffect = (id) => actor.effects.some((e) => e.statuses.has(id));

    // 1. HEAD WOUND -> STUNNED
    // Only re-derive Stunned when the head field itself changed - otherwise editing an
    // unrelated wound (e.g. a leg) would silently re-apply Stunned after a GM manually
    // cleared it to represent rest/drugs/medical intervention without healing the head.
    if (changedWoundFields.has('head')) {
        const desiredStunned = resolveStunnedFromHeadWound(w.head, hasEffect('stunned'));
        if (desiredStunned !== null) {
            effectsToToggle.push({ id: 'stunned', active: desiredStunned });
        }
    }

    // 2. BOT LEG WOUNDS -> IMMOBILE
    const legsGone = w.lLeg === true && w.rLeg === true;
    if (legsGone && !hasEffect('immobile')) {
        effectsToToggle.push({ id: 'immobile', active: true });
    } else if (!legsGone && hasEffect('immobile')) {
        // Check if immobile was caused by something else (Encumbrance)?
        // If Encumbrance is forcing immobile, we shouldn't remove it.
        // We can check encumbrance state (only for characters, NPCs don't have encumbrance)
        const hasEncumbrance = actor.system.encumbrance && actor.system.encumbrance.value !== undefined;
        const isEncumbered = hasEncumbrance && actor.system.encumbrance.value > actor.system.encumbrance.max;

        // Only remove if NOT encumbered (or if NPC which doesn't have encumbrance)
        if (!isEncumbered) {
            effectsToToggle.push({ id: 'immobile', active: false });
        }
    }

    // EXECUTE UPDATES
    // processing sequentially to avoid race conditions
    for (const change of effectsToToggle) {
        await actor.toggleStatusEffect(change.id, { active: change.active });
    }

    await syncBleedingToWounds(actor);

    const woundCount = countWounds(w);
    if (woundCount >= 6) {
        if (actor.system.hp.value > 0) {
            await actor.update({ 'system.hp.value': 0 });
        } else if (!actor.effects.some((e) => e.statuses.has('dead'))) {
            await actor.toggleStatusEffect('dead', { active: true, overlay: true });
        }
    }

    // Force sheet to re-render if it's open to update the condition icons
    if (actor.sheet?.rendered) {
        await actor.sheet.render(false);
    }
}

/**
 * Separate function to handle HP math logic
 * @param {Actor} actor
 */
export async function handleWoundThresholds(actor) {
    // Calculate your thresholds
    const hp = actor.system.hp.value;
    const max = actor.system.hp.max;
    const woundCount = countWounds(actor.system.wounds);

    // Helper to check if effect exists
    const hasEffect = (id) => actor.effects.some((e) => e.statuses.has(id));

    // 1. DEAD (HP <= 0 or six wounds — instant death regardless of HP)
    // We apply as overlay for visual emphasis
    const isDead = hp <= 0 || woundCount >= 6;
    if (isDead && !hasEffect('dead')) {
        await actor.toggleStatusEffect('dead', { active: true, overlay: true });
    } else if (!isDead && hasEffect('dead')) {
        await actor.toggleStatusEffect('dead', { active: false });
    }

    // 2. CRITICAL (HP <= floor(Max/2) AND Not Dead)
    // Note: We use the Effect ID (e.g., 'critical') not the boolean
    const isCritical = hp > 0 && hp <= Math.floor(max / 2);

    if (isCritical && !hasEffect('critical')) {
        await actor.toggleStatusEffect('critical', { active: true });
    } else if (!isCritical && hasEffect('critical')) {
        await actor.toggleStatusEffect('critical', { active: false });
    }
}
