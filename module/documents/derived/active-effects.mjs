/**
 * Pure active effect helpers for actor derived data (no document runtime).
 */

/**
 * Active effect change rows (Foundry 14 may store under effect.system.changes).
 * @param {object} effect
 * @returns {Array<{ key: string, mode: number, value: unknown }>}
 */
export function effectChangeRows(effect) {
    const root = effect?.changes;
    if (Array.isArray(root) && root.length) return root;
    const nested = effect?.system?.changes;
    return Array.isArray(nested) ? nested : [];
}

/**
 * All numeric mode values that represent ADD across Foundry v10–v14.
 * @param {{ ACTIVE_EFFECT_CHANGE_TYPES?: Record<string, number>, ACTIVE_EFFECT_MODES?: Record<string, number> }} [constants]
 * @returns {Set<number>}
 */
export function resolveActiveEffectAddModes(constants = globalThis.CONST) {
    const types = constants?.ACTIVE_EFFECT_CHANGE_TYPES;
    const modes = constants?.ACTIVE_EFFECT_MODES;
    const candidates = [types?.add, types?.ADD, modes?.ADD, 2];
    return new Set(candidates.filter((v) => v !== undefined && v !== null));
}

/**
 * @param {number} mode
 * @param {Set<number>} addModes
 */
export function isActiveEffectAddMode(mode, addModes) {
    return addModes.has(mode);
}

/**
 * Sum ADD modifiers from enabled effects on system.stats.<key>.bonus or legacy .value.
 * @param {Array<{ disabled?: boolean, changes?: unknown[], system?: { changes?: unknown[] } }>} effects
 * @param {string} statKey
 * @param {Set<number>} addModes
 */
export function sumActiveEffectAddsForStat(effects, statKey, addModes) {
    const kb = `system.stats.${statKey}.bonus`;
    const kv = `system.stats.${statKey}.value`;
    let sum = 0;
    for (const effect of effects ?? []) {
        if (effect.disabled) continue;
        for (const ch of effectChangeRows(effect)) {
            if (!isActiveEffectAddMode(ch.mode, addModes)) continue;
            if (ch.key === kb || ch.key === kv) sum += Number(ch.value) || 0;
        }
    }
    return sum;
}
