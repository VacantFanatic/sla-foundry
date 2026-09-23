/**
 * Pure helpers for the GM Combat HUD (no Foundry globals — unit tested directly).
 */

/** Core stats shown as one-click roll buttons, in sheet order. */
export const HUD_STAT_KEYS = ['str', 'dex', 'know', 'conc', 'cha', 'cool'];

/**
 * Decide which actor the HUD shows.
 * Priority: pinned actor > exactly one controlled token > active combatant > last shown.
 * Several controlled tokens are ambiguous, so they fall through to the combatant.
 * @param {object} args
 * @param {string | null} [args.pinnedId]
 * @param {string[]} [args.controlledActorIds]
 * @param {string | null} [args.activeCombatantActorId]
 * @param {string | null} [args.lastId]
 * @returns {string | null}
 */
export function resolveHudActorId({ pinnedId, controlledActorIds, activeCombatantActorId, lastId } = {}) {
    if (pinnedId) return pinnedId;
    const controlled = Array.isArray(controlledActorIds) ? [...new Set(controlledActorIds.filter(Boolean))] : [];
    if (controlled.length === 1) return controlled[0];
    if (activeCombatantActorId) return activeCombatantActorId;
    return lastId ?? null;
}

/**
 * Stat buttons for the HUD quick-roll row.
 * @param {Record<string, { value?: number, total?: number }> | undefined} stats
 * @returns {Array<{ key: string, label: string, total: number }>}
 */
export function compactStatRows(stats) {
    return HUD_STAT_KEYS.map((key) => {
        const s = stats?.[key] ?? {};
        const total = Number(s.total ?? s.value) || 0;
        return { key, label: key.toUpperCase(), total };
    });
}

/**
 * Stable sort putting equipped weapons first so the ones the actor can fire now are on top.
 * @template {{ system?: { equipped?: boolean } }} T
 * @param {T[]} weapons
 * @returns {T[]}
 */
export function equippedFirst(weapons) {
    if (!Array.isArray(weapons)) return [];
    return weapons
        .map((w, i) => ({ w, i }))
        .sort((a, b) => Number(Boolean(b.w?.system?.equipped)) - Number(Boolean(a.w?.system?.equipped)) || a.i - b.i)
        .map(({ w }) => w);
}

/**
 * Index step for the prev/next combatant arrows, wrapping around.
 * @param {number} currentIndex  -1 when the shown actor is not in the list
 * @param {number} length
 * @param {1 | -1} dir
 * @returns {number}  -1 when the list is empty
 */
export function stepIndex(currentIndex, length, dir) {
    if (!length) return -1;
    if (currentIndex < 0) return dir > 0 ? 0 : length - 1;
    return (((currentIndex + dir) % length) + length) % length;
}
