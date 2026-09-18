/**
 * Pure initiative and movement resolution for actor derived data (character type only).
 */

/**
 * @param {{ dexTotal: number, concTotal: number, armorInitBonus: number }} params
 * @returns {number}
 */
export function computeInitiativeBonus({ dexTotal, concTotal, armorInitBonus }) {
    return (dexTotal || 0) + (concTotal || 0) + (armorInitBonus || 0);
}

/**
 * @param {{
 *   speciesClosing: number,
 *   speciesRushing: number,
 *   athleticsRank: number,
 *   armorMoveBonus: { closing?: number, rushing?: number },
 *   critical: boolean,
 *   stunned: boolean,
 *   encumbranceMoveCap: number | null,
 *   immobile: boolean,
 *   dead: boolean
 * }} params
 * @returns {{ closing: number, rushing: number }}
 */
export function computeMovement({
    speciesClosing = 0,
    speciesRushing = 0,
    athleticsRank = 0,
    armorMoveBonus,
    critical,
    stunned,
    encumbranceMoveCap = null,
    immobile,
    dead
}) {
    let closing = speciesClosing;
    // Athletics Bonus (+1 Rushing per 2 Ranks)
    let rushing = speciesRushing + Math.floor(athleticsRank / 2);

    if (armorMoveBonus) {
        closing += armorMoveBonus.closing || 0;
        rushing += armorMoveBonus.rushing || 0;
    }

    // Critical / Stunned: may not move faster than Closing (rushing capped to closing)
    if (critical || stunned) {
        if (rushing > closing) rushing = closing;
    }

    // Encumbrance Cap (Sets Rushing to at most the cap when overburdened)
    if (encumbranceMoveCap !== null) {
        rushing = Math.min(rushing, encumbranceMoveCap);
    }

    // Immobile / Dead (Zero Movement)
    if (immobile || dead) {
        closing = 0;
        rushing = 0;
    }

    return { closing, rushing };
}
