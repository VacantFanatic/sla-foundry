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
 * The 7 canonical Foundry v14 change-type strings a real `change.type` can hold, and each
 * type's own default application priority.
 *
 * IMPORTANT — confirmed live against a running Foundry v14.367 instance: these string keys
 * ('add', 'subtract', ...) are `change.type`'s actual values directly; there is no uppercase
 * `CONST.ACTIVE_EFFECT_CHANGE_TYPES.ADD`-style constant that maps to them. `CONST.ACTIVE_EFFECT_CHANGE_TYPES`
 * is keyed by these same lowercase strings but maps to unrelated *numbers* (`.add === 20`, not
 * `'add'`) — those numbers are each type's default priority, which is why they're reproduced
 * here instead of read from CONST. There is nothing dynamic to resolve: Foundry's own
 * `ActiveEffect#prepareBaseData` hardcodes this exact mapping the same way
 * (`ActiveEffect.CHANGE_TYPES[change.type]?.defaultPriority`).
 */
const DEFAULT_CHANGE_PRIORITY = {
    custom: 0,
    multiply: 10,
    add: 20,
    subtract: 20,
    downgrade: 30,
    upgrade: 40,
    override: 50
};

/**
 * Pre-v14 numeric CONST.ACTIVE_EFFECT_MODES mapped to their v14 string type. Foundry never had
 * a legacy numeric "subtract" mode — it was introduced as a distinct v14 string type with no
 * predecessor, so it's deliberately absent from this table.
 */
const LEGACY_MODE_TYPES = { 0: 'custom', 1: 'multiply', 2: 'add', 3: 'downgrade', 4: 'upgrade', 5: 'override' };

/**
 * Resolves a single change row to its change-type string ('add', 'subtract', 'multiply',
 * 'downgrade', 'upgrade', 'override', or 'custom'). Prefers the canonical v14 string `type`
 * field (used as-is — see the note on `DEFAULT_CHANGE_PRIORITY` for why there's no CONST lookup
 * involved); falls back to the deprecated numeric `mode` field only when `type` is absent
 * (old-world data created before the v14 migration). Returns `null` for a `type` string this
 * system doesn't recognize (per Foundry's own docs, arbitrary module/system-added types are
 * meant to be ignored by anything that doesn't specifically implement them) or an
 * out-of-range legacy `mode`.
 * @param {{ type?: unknown, mode?: number }} change
 * @returns {string | null}
 */
export function resolveActiveEffectChangeType(change) {
    if (typeof change?.type === 'string') {
        return Object.hasOwn(DEFAULT_CHANGE_PRIORITY, change.type) ? change.type : null;
    }
    if (typeof change?.mode === 'number') return LEGACY_MODE_TYPES[change.mode] ?? null;
    return null;
}

/**
 * Applies a single change to a running numeric value, mirroring Foundry's own per-type
 * semantics (`ActiveEffect._applyChangeAdd`/`_applyChangeSubtract`/`_applyChangeMultiply`/
 * `_applyChangeUpgrade` (shared by upgrade/downgrade)/`_applyChangeOverride`). 'custom' (and
 * anything unrecognized) is a no-op: Foundry itself only does something for a custom change
 * when a system registers a handler, and this system registers none.
 * @param {number} currentValue
 * @param {string} changeType
 * @param {number} value
 * @returns {number}
 */
export function applyActiveEffectChange(currentValue, changeType, value) {
    switch (changeType) {
        case 'add':
            return currentValue + value;
        case 'subtract':
            return currentValue - value;
        case 'multiply':
            return currentValue * value;
        case 'downgrade':
            return Math.min(currentValue, value);
        case 'upgrade':
            return Math.max(currentValue, value);
        case 'override':
            return value;
        default:
            return currentValue;
    }
}

/**
 * Computes a derived numeric field by applying every enabled effect's change rows matching one
 * of `keys` to `baseValue`, in ascending priority order. Changes from ALL effects are pooled and
 * sorted together first, exactly like Foundry's own `Actor#applyActiveEffects` — not applied
 * per-effect. A row with no explicit `priority` falls back to its type's own default priority
 * (real ActiveEffect documents already have `priority` resolved by Foundry itself before actor
 * derived data runs; the fallback exists for disabled effects and hand-built test fixtures).
 * @param {Array<{ disabled?: boolean, changes?: unknown[], system?: { changes?: unknown[] } }>} effects
 * @param {string[]} keys - one or more change keys treated as the same target
 * @param {number} baseValue
 * @returns {number}
 */
export function computeActiveEffectFieldValue(effects, keys, baseValue) {
    const rows = [];
    for (const effect of effects ?? []) {
        if (effect.disabled) continue;
        for (const ch of effectChangeRows(effect)) {
            if (!keys.includes(ch.key)) continue;
            const changeType = resolveActiveEffectChangeType(ch);
            if (!changeType) continue;
            const priority = Number.isFinite(ch.priority) ? ch.priority : DEFAULT_CHANGE_PRIORITY[changeType];
            rows.push({ changeType, value: Number(ch.value) || 0, priority });
        }
    }
    rows.sort((a, b) => a.priority - b.priority);
    return rows.reduce((current, row) => applyActiveEffectChange(current, row.changeType, row.value), baseValue);
}

/**
 * Core stat bonus: aliases the `.bonus` and legacy `.value` change keys onto the same
 * sequential-apply chain (a change targeting either is treated as targeting the same field).
 * @param {Array<{ disabled?: boolean, changes?: unknown[], system?: { changes?: unknown[] } }>} effects
 * @param {string} statKey
 * @param {number} baseBonus
 * @returns {number}
 */
export function computeActiveEffectStatBonus(effects, statKey, baseBonus) {
    return computeActiveEffectFieldValue(
        effects,
        [`system.stats.${statKey}.bonus`, `system.stats.${statKey}.value`],
        baseBonus
    );
}

/**
 * Single exact change key, no `.value` aliasing — used for synthetic fields like
 * `system.rollModifier.bonus` that have no separate player-editable base to alias.
 * @param {Array<{ disabled?: boolean, changes?: unknown[], system?: { changes?: unknown[] } }>} effects
 * @param {string} changeKey
 * @param {number} baseValue
 * @returns {number}
 */
export function computeActiveEffectKeyValue(effects, changeKey, baseValue) {
    return computeActiveEffectFieldValue(effects, [changeKey], baseValue);
}

/**
 * Reads a single item-owned effect's change value for `changeKey`, for the handful of
 * powersuit-exclusive numbers (STR replace, DEX cap, init bonus) that `_applyArmorModifiers`
 * applies directly from the *item's own* embedded effects rather than via the actor's normal
 * equip-synced bonus pipeline (those numbers are only supposed to apply from the one active
 * powersuit, never summed across multiple equipped items). Lets a GM author the same number
 * either as a legacy `system.mods`/`dexCap`/`initBonus` field or as a real Active Effect on the
 * item — the caller decides which source wins when both are present.
 * @param {{ effects?: Iterable<{ disabled?: boolean, changes?: unknown[], system?: { changes?: unknown[] } }> }} item
 * @param {string} changeKey
 * @returns {number | null} the first matching enabled change's value, or `null` if none exists
 */
export function readItemEffectOverride(item, changeKey) {
    for (const effect of item?.effects ?? []) {
        if (effect.disabled) continue;
        for (const ch of effectChangeRows(effect)) {
            if (ch.key !== changeKey) continue;
            if (!resolveActiveEffectChangeType(ch)) continue;
            return Number(ch.value) || 0;
        }
    }
    return null;
}
