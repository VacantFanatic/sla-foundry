/**
 * Pure equipped-powered-armor modifier resolution for actor derived data.
 *
 * Powersuits replace STR and cap DEX; other powered armor remains additive. Move/init bonuses
 * accumulate across every equipped powered armor regardless of powersuit status. When more than
 * one armor is processed, the result is order-dependent in the same way the original inline loop
 * was: whichever armor a caller lists last "wins" any overlapping additive stat, and the active
 * powersuit's STR override only sticks if nothing after it in the list adds to STR again.
 */

/**
 * @param {{ armors: Array<{ system: { mods?: object, powersuit?: boolean, dexCap?: number, initBonus?: number, resistance?: { value?: number } } }>, strTotal: number, dexTotal: number }} params
 * @returns {{ str: number, dex: number, initBonus: number, moveBonus: { closing: number, rushing: number } }}
 */
export function computeArmorModifierEffects({ armors, strTotal, dexTotal }) {
    let str = strTotal;
    let dex = dexTotal;
    let initBonus = 0;
    const moveBonus = { closing: 0, rushing: 0 };

    const activePowersuit = armors
        .filter((a) => a.system.powersuit)
        .sort((a, b) => (Number(b.system.resistance?.value) || 0) - (Number(a.system.resistance?.value) || 0))[0];

    for (const armor of armors) {
        const mods = armor.system.mods;
        if (!mods) continue;

        if (armor === activePowersuit) {
            str = Number(mods.str) || 0;
            if (mods.dex) dex += mods.dex;
            const dexCap = Number(armor.system.dexCap) || 0;
            if (dexCap > 0) dex = Math.min(dex, dexCap);
            initBonus += Number(armor.system.initBonus) || 0;
        } else {
            if (mods.str) str += mods.str;
            if (mods.dex) dex += mods.dex;
        }

        if (mods.move) {
            moveBonus.closing += mods.move.closing || 0;
            moveBonus.rushing += mods.move.rushing || 0;
        }
    }

    return { str, dex, initBonus, moveBonus };
}
