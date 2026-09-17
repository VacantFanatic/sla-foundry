/**
 * Resolve the authoritative hp.max for an actor's current derived-data pass.
 *
 * Characters: always recomputed from species base HP + total STR (existing,
 * intentional PC character-creation behaviour), plus `hpBonus` — the
 * Active-Effect-resolved value of `system.hp.bonus` (e.g. a flat +5 HP trait
 * like Gang Colours) — so a standing bonus survives the recompute instead of
 * being overwritten by it.
 *
 * NPCs (Threats): fully GM-authored, like Luck/Flux. Derived data must not
 * overwrite the stored value — it's returned unchanged (plus `hpBonus`) so it
 * survives the next prepareDerivedData() pass after a sheet edit.
 */
export function resolveDerivedHpMax({ type, hpBase, strTotal, hpBonus, storedMax }) {
    const bonus = Number(hpBonus) || 0;
    if (type === 'character') {
        return (Number(hpBase) || 0) + (Number(strTotal) || 0) + bonus;
    }
    const base = Number.isFinite(Number(storedMax))
        ? Number(storedMax)
        : (Number(hpBase) || 0) + (Number(strTotal) || 0);
    return base + bonus;
}
