/**
 * Resolves the display name for an actor's Ebb resource pool (`system.stats.flux`).
 * Most actors show "FLUX"; a GM can rename it per-NPC via `system.ebb.resourceLabel`
 * (e.g. Shi'an "Flow") without changing the underlying data path or roll math.
 *
 * @param {{ ebb?: { resourceLabel?: string } } | null | undefined} system - actor.system
 * @returns {string}
 */
export function resolveEbbResourceLabel(system) {
    const custom = system?.ebb?.resourceLabel?.trim?.();
    return custom || 'FLUX';
}
