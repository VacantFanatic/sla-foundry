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
 * Resolves how to recognize an ADD change across Foundry v14 (canonical string
 * `type`) and pre-v14 worlds (deprecated numeric `mode`).
 * @param {{ ACTIVE_EFFECT_CHANGE_TYPES?: Record<string, string>, ACTIVE_EFFECT_MODES?: Record<string, number> }} [constants]
 * @returns {{ addType: string, legacyAddModes: Set<number> }}
 */
export function resolveActiveEffectAddMatcher(constants = globalThis.CONST) {
    const addType = constants?.ACTIVE_EFFECT_CHANGE_TYPES?.ADD ?? 'add';
    const legacyModes = constants?.ACTIVE_EFFECT_MODES;
    const legacyAddModes = new Set([legacyModes?.ADD, 2].filter((v) => v !== undefined && v !== null));
    return { addType, legacyAddModes };
}

/**
 * True when a single change row is an ADD change. Prefers the canonical v14
 * string `type` field; falls back to the deprecated numeric `mode` field only
 * when `type` is absent (old-world data created before the v14 migration).
 * @param {{ type?: unknown, mode?: number }} change
 * @param {{ addType: string, legacyAddModes: Set<number> }} addMatcher
 */
export function isActiveEffectAddChange(change, { addType, legacyAddModes }) {
    if (typeof change?.type === 'string') return change.type === addType;
    return legacyAddModes.has(change?.mode);
}

/**
 * Sum ADD modifiers from enabled effects on system.stats.<key>.bonus or legacy .value.
 * @param {Array<{ disabled?: boolean, changes?: unknown[], system?: { changes?: unknown[] } }>} effects
 * @param {string} statKey
 * @param {{ addType: string, legacyAddModes: Set<number> }} addMatcher
 */
export function sumActiveEffectAddsForStat(effects, statKey, addMatcher) {
    const kb = `system.stats.${statKey}.bonus`;
    const kv = `system.stats.${statKey}.value`;
    let sum = 0;
    for (const effect of effects ?? []) {
        if (effect.disabled) continue;
        for (const ch of effectChangeRows(effect)) {
            if (!isActiveEffectAddChange(ch, addMatcher)) continue;
            if (ch.key === kb || ch.key === kv) sum += Number(ch.value) || 0;
        }
    }
    return sum;
}
