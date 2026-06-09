/**
 * Pure data-transformation helpers for world migration.
 * No Foundry runtime dependencies — safe to import in unit tests.
 */

/**
 * 2.4.8: `system.removeWounds` on ebbFormula was boolean; now integer 0–6 (true → 6).
 * @param {{ system?: { removeWounds?: unknown } }} item
 * @returns {object|null} Update payload without `_id`
 */
export function getEbbFormulaRemoveWoundsMigrationUpdate(item) {
    const rw = item?.system?.removeWounds;
    if (typeof rw === 'boolean') {
        return { 'system.removeWounds': rw ? 6 : 0 };
    }
    if (typeof rw === 'number') {
        const n = Math.max(0, Math.min(6, Math.floor(rw)));
        return n !== rw ? { 'system.removeWounds': n } : null;
    }
    if (rw !== undefined && rw !== null) {
        return { 'system.removeWounds': 0 };
    }
    return null;
}

/**
 * Merge ebbFormula migrations: removeWounds coercion, legacy ebbEffect, and ebbHpWoundMode rename.
 * @param {{ system?: Record<string, unknown> }} item
 * @returns {object|null} Update payload without `_id`
 */
export function getEbbFormulaMigrationUpdate(item) {
    const updates = {};
    const rw = getEbbFormulaRemoveWoundsMigrationUpdate(item);
    if (rw) Object.assign(updates, rw);
    if (item?.system?.ebbEffect === 'none') {
        updates['system.ebbEffect'] = 'effect';
    }
    const legacyHpWound = item?.system?.ebbHpWoundMode;
    const healWound = item?.system?.ebbHealWoundMode;
    if (legacyHpWound !== undefined && healWound === undefined) {
        updates['system.ebbHealWoundMode'] = legacyHpWound === 'or' ? 'or' : 'and';
        updates['system.-=ebbHpWoundMode'] = null;
    }
    return Object.keys(updates).length ? updates : null;
}

/**
 * @param {{ system?: Record<string, unknown> }} actor
 * @returns {Record<string, unknown>}
 */
export function getVehicleActorMigrationData(actor) {
    const system = actor.system || {};
    const updateData = {};

    if (system.notes === undefined) updateData['system.notes'] = '';
    if (system.skill === undefined) updateData['system.skill'] = '';
    if (!system.dimensions) updateData['system.dimensions'] = { length: '', width: '', height: '' };
    else {
        if (system.dimensions.length === undefined) updateData['system.dimensions.length'] = '';
        if (system.dimensions.width === undefined) updateData['system.dimensions.width'] = '';
        if (system.dimensions.height === undefined) updateData['system.dimensions.height'] = '';
    }
    if (system.capacity === undefined) updateData['system.capacity'] = '';
    if (system.mountedWeaponsIgnoreSkillReq === undefined) updateData['system.mountedWeaponsIgnoreSkillReq'] = true;
    if (system.providesCombatCover === undefined) updateData['system.providesCombatCover'] = true;

    if (!system.hp) updateData['system.hp'] = { value: 10, max: 10 };
    else {
        if (system.hp.value === undefined) updateData['system.hp.value'] = 10;
        if (system.hp.max === undefined) updateData['system.hp.max'] = 10;
    }

    if (!system.armor) updateData['system.armor'] = { pv: 0, resist: { value: 0, max: 0 } };
    else {
        if (system.armor.pv === undefined) updateData['system.armor.pv'] = 0;
        if (!system.armor.resist) updateData['system.armor.resist'] = { value: 0, max: 0 };
        else {
            if (system.armor.resist.value === undefined) updateData['system.armor.resist.value'] = 0;
            if (system.armor.resist.max === undefined) updateData['system.armor.resist.max'] = 0;
        }
    }

    if (!system.move) updateData['system.move'] = { value: 0 };
    else if (system.move.value === undefined) updateData['system.move.value'] = 0;

    return updateData;
}

/**
 * @param {{ id?: string, system?: Record<string, unknown> }} item
 * @returns {object|null} Update payload with `_id`, or null if no changes needed
 */
export function getArmorMigrationData(item) {
    const system = item.system;
    const updateData = { _id: item.id };
    let hasChanges = false;

    if (system.powered === undefined) {
        updateData['system.powered'] = false;
        hasChanges = true;
    }
    if (!system.mods) {
        updateData['system.mods'] = { str: 0, dex: 0, move: { closing: 0, rushing: 0 } };
        hasChanges = true;
    }
    if (system.powersuit === undefined) {
        updateData['system.powersuit'] = false;
        hasChanges = true;
    }
    if (system.dexCap === undefined) {
        updateData['system.dexCap'] = 0;
        hasChanges = true;
    }
    if (system.initBonus === undefined) {
        updateData['system.initBonus'] = 0;
        hasChanges = true;
    }

    return hasChanges ? updateData : null;
}

/**
 * @param {{ id?: string, system?: Record<string, unknown> }} item
 * @param {string[]} meleeSkills
 * @returns {object|null} Update payload with `_id`, or null if no changes needed
 */
export function getWeaponMigrationData(item, meleeSkills) {
    const system = item.system;

    let attackType = system.attackType;
    if (!attackType) {
        const skillName = (system.skill || '').toLowerCase().trim();
        attackType = meleeSkills.includes(skillName) ? 'melee' : 'ranged';
    }

    let firingModes = system.firingModes;
    const firingModesEmpty = !firingModes || Object.keys(firingModes).length === 0;
    if (attackType === 'ranged' && firingModesEmpty) {
        const oldRecoil = Number(system.recoil) || 0;
        firingModes = {
            single: { label: 'Single', active: true, rounds: 1, recoil: 0 },
            burst: { label: 'Burst', active: false, rounds: 3, recoil: oldRecoil > 0 ? oldRecoil : 1 },
            auto: { label: 'Full Auto', active: false, rounds: 10, recoil: oldRecoil > 0 ? oldRecoil * 2 : 4 }
        };
    }

    const updateData = { _id: item.id };
    let hasChanges = false;

    if (system.attackType !== attackType) {
        updateData['system.attackType'] = attackType;
        hasChanges = true;
    }
    if (firingModes && JSON.stringify(system.firingModes) !== JSON.stringify(firingModes)) {
        updateData['system.firingModes'] = firingModes;
        hasChanges = true;
    }
    if (system.powersuitAttack === undefined) {
        updateData['system.powersuitAttack'] = false;
        hasChanges = true;
    }
    if (system.attackPenalty === undefined) {
        updateData['system.attackPenalty'] = 0;
        hasChanges = true;
    }
    if (system.adFromStrMinus === undefined) {
        updateData['system.adFromStrMinus'] = 0;
        hasChanges = true;
    }

    return hasChanges ? updateData : null;
}

/**
 * @param {{ id?: string, name?: string, system?: Record<string, unknown> }} item
 * @returns {object|null} Update payload with `_id`, or null if no changes needed
 */
export function getSpeciesMigrationData(item) {
    const system = item.system;
    const updateData = { _id: item.id };
    let hasChanges = false;
    const name = item.name.toLowerCase();

    let luckInit = 0,
        luckMax = 0,
        fluxInit = 0,
        fluxMax = 0;
    let hpBase = 10;
    let moveClosing = 0,
        moveRushing = 0;

    if (name.includes('ebon')) {
        fluxInit = 2;
        fluxMax = 6;
        hpBase = 14;
        moveClosing = 2;
        moveRushing = 5;
    } else if (name.includes('human')) {
        luckInit = 1;
        luckMax = 6;
        hpBase = 14;
        moveClosing = 2;
        moveRushing = 5;
    } else if (name.includes('frother')) {
        luckInit = 1;
        luckMax = 3;
        hpBase = 15;
        moveClosing = 2;
        moveRushing = 5;
    } else if (name.includes('wraithen')) {
        luckInit = 1;
        luckMax = 4;
        hpBase = 14;
        moveClosing = 4;
        moveRushing = 8;
    } else if (name.includes('shaktar')) {
        luckInit = 0;
        luckMax = 3;
        hpBase = 19;
        moveClosing = 3;
        moveRushing = 6;
    } else if (name.includes('carrien')) {
        luckInit = 0;
        luckMax = 3;
        hpBase = 20;
        moveClosing = 4;
        moveRushing = 7;
    } else if (name.includes('neophron')) {
        luckInit = 0;
        luckMax = 3;
        hpBase = 11;
        moveClosing = 2;
        moveRushing = 5;
    } else if (name.includes('stormer')) {
        if (name.includes('313') || name.includes('malice')) {
            luckInit = 0;
            luckMax = 2;
            hpBase = 22;
            moveClosing = 3;
            moveRushing = 6;
        } else if (name.includes('711') || name.includes('xeno')) {
            luckInit = 0;
            luckMax = 2;
            hpBase = 20;
            moveClosing = 4;
            moveRushing = 6;
        } else {
            luckInit = 0;
            luckMax = 2;
            hpBase = 20;
            moveClosing = 3;
            moveRushing = 6;
        }
    }

    const currLuckInit = system.luck?.initial || 0;
    const currLuckMax = system.luck?.max || 0;
    const currFluxInit = system.flux?.initial || 0;
    const currFluxMax = system.flux?.max || 0;

    if (currLuckInit !== luckInit || currLuckMax !== luckMax) {
        updateData['system.luck.initial'] = luckInit;
        updateData['system.luck.max'] = luckMax;
        hasChanges = true;
    }
    if (currFluxInit !== fluxInit || currFluxMax !== fluxMax) {
        updateData['system.flux.initial'] = fluxInit;
        updateData['system.flux.max'] = fluxMax;
        hasChanges = true;
    }

    const currHp = system.hp || 0;
    if (hpBase > 0 && currHp !== hpBase) {
        updateData['system.hp'] = hpBase;
        hasChanges = true;
    }

    const currClosing = system.move?.closing || 0;
    const currRushing = system.move?.rushing || 0;
    if (moveClosing > 0 && (currClosing !== moveClosing || currRushing !== moveRushing)) {
        updateData['system.move.closing'] = moveClosing;
        updateData['system.move.rushing'] = moveRushing;
        hasChanges = true;
    }

    return hasChanges ? updateData : null;
}
