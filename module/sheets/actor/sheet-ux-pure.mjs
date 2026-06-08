/** @typedef {'buffed' | 'debuffed' | 'neutral'} StatPlayTone */

/** @typedef {'healthy' | 'warning' | 'critical' | 'empty'} HpBarTone */

const WOUND_KEYS = ['head', 'torso', 'lArm', 'rArm', 'lLeg', 'rLeg'];

/**
 * @param {Record<string, boolean> | undefined} wounds
 * @returns {number}
 */
export function countWounds(wounds) {
    if (!wounds || typeof wounds !== 'object') return 0;
    let n = 0;
    for (const key of WOUND_KEYS) {
        if (wounds[key]) n += 1;
    }
    return n;
}

/**
 * CSS class for play-mode stat total coloring.
 * @param {number} total
 * @param {number} base
 * @returns {string}
 */
export function statPlayColorClass(total, base) {
    const t = Number(total) || 0;
    const b = Number(base) || 0;
    if (t < b) return 'sla-stat-debuffed';
    if (t > b) return 'sla-stat-buffed';
    return 'sla-stat-neutral';
}

/**
 * @param {number} value
 * @param {number} max
 * @returns {{ percent: number, tone: HpBarTone }}
 */
export function hpBarState(value, max) {
    const v = Number(value) || 0;
    const m = Number(max) || 0;
    if (m <= 0) return { percent: 0, tone: 'empty' };
    const percent = Math.max(0, Math.min(100, Math.round((v / m) * 100)));
    if (percent <= 50) return { percent, tone: 'critical' };
    if (percent <= 75) return { percent, tone: 'warning' };
    return { percent, tone: 'healthy' };
}

/**
 * @param {number} value
 * @param {number} max
 * @returns {boolean}
 */
export function isEncumbranceOverloaded(value, max) {
    const v = Number(value) || 0;
    const m = Number(max) || 0;
    return m > 0 && v >= m;
}

/**
 * @param {number} value
 * @param {number} max
 * @returns {boolean}
 */
export function isEncumbranceWarning(value, max) {
    const v = Number(value) || 0;
    const m = Number(max) || 0;
    return m > 0 && v >= m * 0.85 && v < m;
}

/**
 * Map legacy persisted tab ids to current operative tab ids.
 * @param {string} tab
 * @returns {string}
 */
export function normalizeOperativeTabId(tab) {
    if (tab === 'biography') return 'traits';
    return tab;
}

/**
 * Operative primary tab order (Ebb omitted when not Ebonite).
 * @param {boolean} isEbonite
 * @returns {string[]}
 */
export function operativeTabOrder(isEbonite) {
    const tabs = ['main', 'combat', 'inventory', 'effects', 'traits', 'notes'];
    if (isEbonite) tabs.push('ebb');
    return tabs;
}
