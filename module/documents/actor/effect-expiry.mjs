import { createKeyedQueue } from '../../helpers/keyed-queue.mjs';
import { allEffectsExpired, selectOverdueEffects, selectRevivedEffects } from '../derived/effect-duration.mjs';

/**
 * When a timed effect copied from a drug expires, switch the drug off once ALL of its copies have expired.
 * The actor's update hook then fires `deactivate`, which removes the drug's expired copies, so the sheet
 * stops showing an "Active" drug whose effects are over. A drug with a 1 hour and a 4 hour effect stays on
 * until the 4 hour one is done. Only the active GM's client acts (it is also the only one core lets mark
 * effects expired), so this never runs twice.
 *
 * Registered on Foundry's `updateActiveEffect` hook.
 * @param {ActiveEffect} effect
 * @param {object} changes
 * @returns {Promise<void>}
 */
export async function switchOffDrugWhenExpired(effect, changes) {
    if (!game.user?.isActiveGM) return;
    if (changes?.duration?.expired !== true) return;
    const actor = effect.parent;
    if (!(actor instanceof Actor) || !effect.origin) return;

    const item = await fromUuid(effect.origin);
    if (!item || item.type !== 'drug' || item.parent !== actor || item.system.active !== true) return;

    const copies = actor.effects.filter((e) => e.origin === effect.origin);
    if (!allEffectsExpired(copies)) return;
    await item.update({ 'system.active': false });
}

/**
 * Flag a copied effect carries so the Effects tab can still name its source after the item is gone
 * (a used-up drug is deleted right after its effects are applied).
 */
export const SOURCE_NAME_FLAG = 'sourceName';

/**
 * Whether an effect is a copy of an item's effect whose source item no longer exists.
 * @param {ActiveEffect} effect
 * @returns {boolean}
 */
export function isOrphanedItemCopy(effect) {
    const origin = effect?.origin;
    if (typeof origin !== 'string' || !origin.includes('.Item.')) return false;
    try {
        return !fromUuidSync(origin, { strict: false });
    } catch (_err) {
        return false;
    }
}

/** Every actor that can own tracked effects: world actors plus the synthetic actors of unlinked tokens. */
function* trackedActors() {
    yield* game.actors;
    for (const scene of game.scenes) {
        for (const token of scene.tokens) {
            if (!token.actorLink && token.actor) yield token.actor;
        }
    }
}

/**
 * Record expiry for clock-based effects whose time has run out, and clean up used-up drug copies.
 *
 * Foundry only writes `duration.expired` when it processes an event (a clock change, a combat turn), never when an
 * effect is created or edited, and it gates an effect created with a numeric duration on the schema-default
 * `turnStart` event, so in combat a clock jump of hours leaves a 1-hour effect active until its owner's next turn.
 * This is the system's own pass: for a clock-based effect with no real event gating it (see `effectiveExpiry`) that
 * is overdue, set `duration.expired = true` (the value core writes, so the two agree and the effect is suppressed).
 * An expired copy whose source item no longer exists has nothing left to switch it off, so it is deleted. If the
 * clock was moved back, an effect recorded as expired whose time has not run out is marked live again.
 * Rounds/turns durations and effects waiting on an explicit event stay core's job.
 *
 * Active GM only, one batched write per actor, idempotent.
 * @param {Actor} [onlyActor] Limit the pass to one actor.
 * @returns {Promise<void>}
 */
export async function expireOverdueEffects(onlyActor) {
    if (!game.user?.isActiveGM) return;
    const actors = onlyActor ? [onlyActor] : [...trackedActors()];
    for (const actor of actors) {
        await sweepQueue.run(actor.uuid, () => sweepActor(actor)).catch((err) => console.error(err));
    }
}

/**
 * How long to wait before deleting orphaned copies. Core records expiry for the same clock change with its own
 * writes, which are already in flight; deleting first makes the server reject them ("id ... does not exist").
 */
const CORE_REFRESH_SETTLE_MS = 400;

/** One sweep at a time per actor: a clock change, an edit and a drug switch-off can all trigger one at once. */
const sweepQueue = createKeyedQueue();

/**
 * The ids that still exist on the actor. Each write below can delete effects (a drug switching off removes its
 * copies), so ids gathered before an `await` may be gone by the time they are used.
 * @param {Actor} actor
 * @param {string[]} ids
 * @returns {string[]}
 */
function stillOnActor(actor, ids) {
    return ids.filter((id) => actor.effects.has(id));
}

/** @param {Actor} actor */
async function sweepActor(actor) {
    const effects = Array.from(actor.effects);
    for (const effect of effects) {
        if (effect.isTemporary) effect.updateDuration?.();
    }
    const overdue = new Set(selectOverdueEffects(effects));
    const orphanIds = [];
    const expireIds = [];
    for (const effect of effects) {
        const expired = effect.duration?.expired === true || overdue.has(effect);
        if (!expired) continue;
        if (isOrphanedItemCopy(effect)) orphanIds.push(effect.id);
        // An orphan is recorded as expired first, like any other copy, so the clock change's own write to it
        // (core records expiry on the same event) has landed before the delete below.
        if (overdue.has(effect)) expireIds.push(effect.id);
    }
    // The clock went back: an effect recorded as expired whose time has not run out is live again.
    const reviveIds = selectRevivedEffects(effects)
        .filter((effect) => !orphanIds.includes(effect.id))
        .map((effect) => effect.id);
    const revive = stillOnActor(actor, reviveIds);
    if (revive.length) {
        await actor.updateEmbeddedDocuments(
            'ActiveEffect',
            revive.map((_id) => ({ _id, 'duration.expired': false }))
        );
    }
    const expire = stillOnActor(actor, expireIds);
    if (expire.length) {
        await actor.updateEmbeddedDocuments(
            'ActiveEffect',
            expire.map((_id) => ({ _id, 'duration.expired': true }))
        );
    }
    if (orphanIds.length) {
        await new Promise((resolve) => setTimeout(resolve, CORE_REFRESH_SETTLE_MS));
        const orphans = stillOnActor(actor, orphanIds);
        if (orphans.length) await actor.deleteEmbeddedDocuments('ActiveEffect', orphans);
    }
}

/**
 * `createActiveEffect` / `updateActiveEffect` handler: re-check the owner when an actor effect is created or its
 * duration/start is edited (a duration typed in after the time has already passed). Ignores the update that only
 * records expiry, which is this pass's own write.
 * @param {ActiveEffect} effect
 * @param {object} [changes] Present for updates.
 * @returns {Promise<void>}
 */
export async function recheckEffectOwner(effect, changes) {
    if (!(effect?.parent instanceof Actor)) return;
    if (changes) {
        const durationKeys = Object.keys(changes.duration ?? {});
        const touchedTiming = changes.start !== undefined || durationKeys.some((k) => k !== 'expired');
        if (!touchedTiming) return;
    }
    await expireOverdueEffects(effect.parent);
}
