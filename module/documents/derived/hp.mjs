/**
 * Resolve the authoritative hp.max for an actor's current derived-data pass.
 *
 * Characters: always recomputed from species base HP + total STR (existing,
 * intentional PC character-creation behaviour — unchanged).
 *
 * NPCs (Threats): fully GM-authored, like Luck/Flux. Derived data must not
 * overwrite it — the stored value is returned unchanged so it survives the
 * next prepareDerivedData() pass after a sheet edit.
 */
export function resolveDerivedHpMax({ type, hpBase, strTotal, storedMax }) {
    if (type === 'character') {
        return (Number(hpBase) || 0) + (Number(strTotal) || 0);
    }
    return Number.isFinite(Number(storedMax)) ? Number(storedMax) : (Number(hpBase) || 0) + (Number(strTotal) || 0);
}
