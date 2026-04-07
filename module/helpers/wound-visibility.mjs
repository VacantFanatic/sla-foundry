/**
 * Decide whether the MOS wound choice button should be shown.
 *
 * @param {object} options
 * @param {boolean} options.hasChoice Whether MOS provides a tactical choice.
 * @param {string | null | undefined} [options.targetActorType] Target actor type ("npc", "character", etc.).
 * @param {boolean} options.enableNpcWoundTracking World setting for NPC wound tracking.
 * @returns {boolean}
 */
export function shouldShowMosWoundChoice({ hasChoice, targetActorType, enableNpcWoundTracking }) {
    if (!hasChoice) return false;
    if (targetActorType === "npc" && !enableNpcWoundTracking) return false;
    return true;
}
