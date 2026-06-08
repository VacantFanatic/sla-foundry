/**
 * Pure stat penalty application for actor derived data.
 */

/**
 * @param {Record<string, { total?: number }>} stats
 * @param {{ encumbrancePenalty: number, critical: boolean }} options
 * @returns {Record<string, { total: number }>}
 */
export function applyStatPenalties(stats, { encumbrancePenalty, critical }) {
    const out = {};
    for (const [key, stat] of Object.entries(stats)) {
        out[key] = { ...stat, total: Number(stat.total) || 0 };
    }

    if (encumbrancePenalty > 0 && out.dex) {
        out.dex.total = Math.max(0, out.dex.total - encumbrancePenalty);
    }

    if (critical) {
        if (out.str) out.str.total = Math.max(0, out.str.total - 2);
        if (out.dex) out.dex.total = Math.max(0, out.dex.total - 2);
        if (out.conc) out.conc.total = Math.max(0, out.conc.total - 1);
        if (out.cool) out.cool.total = Math.max(0, out.cool.total - 1);
    }

    return out;
}
