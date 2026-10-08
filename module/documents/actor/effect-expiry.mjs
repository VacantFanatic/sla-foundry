import { allEffectsExpired } from '../derived/effect-duration.mjs';

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
