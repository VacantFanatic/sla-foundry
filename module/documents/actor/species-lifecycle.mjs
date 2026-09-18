import { resolveNaturalWeaponForSpecies, resolveSpeciesDefaults } from './species-lifecycle-pure.mjs';

/**
 * @param {Actor} actor
 * @param {Item} speciesItem
 */
export async function handleSpeciesAdd(actor, speciesItem) {
    // 0. SINGLETON ENFORCEMENT: Check for existing species and delete them
    const existingSpecies = actor.items.filter((i) => i.type === 'species' && i.id !== speciesItem.id);
    if (existingSpecies.length > 0) {
        const deleteIds = existingSpecies.map((i) => i.id);
        if (typeof ui !== 'undefined') ui.notifications.info(`Replacing existing species...`);
        await actor.deleteEmbeddedDocuments('Item', deleteIds);
    }

    const speciesName = speciesItem.name.toLowerCase();

    // 1. Natural Weapons Logic
    const weaponToAdd = resolveNaturalWeaponForSpecies(speciesName);
    if (weaponToAdd) {
        // Check if it already exists to avoid duplicates
        // We use 'find' but since we just cleared species, we might need to check if we cleared weapons too?
        // Natural Weapons are separate Items. handleSpeciesRemove handles their deletion.
        // So if we just deleted the old species, its weapons are gone (via handleSpeciesRemove).
        const exists = actor.items.find((i) => i.name === weaponToAdd.name);
        if (!exists) {
            await actor.createEmbeddedDocuments('Item', [weaponToAdd]);
            if (typeof ui !== 'undefined') ui.notifications.info(`Added natural weapon: ${weaponToAdd.name}`);
        }
    }

    // 2. Determine Stats (Prioritize Item Data, Fallback to Defaults if missing)
    const sys = speciesItem.system;
    let luckInit = sys.luck?.initial ?? 0;
    let luckMax = sys.luck?.max ?? 0;
    let fluxInit = sys.flux?.initial ?? 0;
    let fluxMax = sys.flux?.max ?? 0;
    let hpBase = sys.hp ?? 0;
    let moveClosing = sys.move?.closing ?? 0;
    let moveRushing = sys.move?.rushing ?? 0;

    // CHECK: If this looks like an "Unmigrated/Broken" item (all zeros), try to apply known defaults
    const isBlank = luckMax === 0 && fluxMax === 0 && hpBase <= 10 && moveClosing === 0;

    if (isBlank) {
        console.warn(
            `SLA Industries | Detected potentially unmigrated Species Item: ${speciesItem.name}. Applying system defaults.`
        );
        const defaults = resolveSpeciesDefaults(speciesName);
        if (defaults) {
            luckInit = defaults.luckInit ?? luckInit;
            luckMax = defaults.luckMax ?? luckMax;
            fluxInit = defaults.fluxInit ?? fluxInit;
            fluxMax = defaults.fluxMax ?? fluxMax;
            hpBase = defaults.hpBase ?? hpBase;
            moveClosing = defaults.moveClosing ?? moveClosing;
            moveRushing = defaults.moveRushing ?? moveRushing;
        }
    }

    // Prepare Updates
    const updateData = {};
    const itemUpdateData = {};

    // LUCK
    if (luckMax > 0) {
        updateData['system.stats.luck.value'] = luckInit;
        updateData['system.stats.luck.max'] = luckMax;
        if (isBlank) {
            itemUpdateData['system.luck.initial'] = luckInit;
            itemUpdateData['system.luck.max'] = luckMax;
        }
    }

    // FLUX
    if (fluxMax > 0) {
        updateData['system.stats.flux.value'] = fluxInit;
        updateData['system.stats.flux.max'] = fluxMax;
        if (isBlank) {
            itemUpdateData['system.flux.initial'] = fluxInit;
            itemUpdateData['system.flux.max'] = fluxMax;
        }
    }

    // HP Base
    if (hpBase > 0) {
        // Note: Actor HP is derived in _calculateDerived, so we don't strictly need to set actor.system.hp.max here
        // But we SHOULD ensure the embedded item has the data if it was blank
        if (isBlank) itemUpdateData['system.hp'] = hpBase;
    }

    // MOVEMENT
    if (moveClosing > 0) {
        if (isBlank) {
            itemUpdateData['system.move.closing'] = moveClosing;
            itemUpdateData['system.move.rushing'] = moveRushing;
        }
    }

    // 3. APPLY ACTOR UPDATE
    if (!foundry.utils.isEmpty(updateData)) {
        await actor.update(updateData);
    }

    // 4. APPLY ITEM UPDATE (Fix the Item if it was broken)
    if (!foundry.utils.isEmpty(itemUpdateData)) {
        await speciesItem.update(itemUpdateData);
    }
}

/**
 * @param {Actor} actor
 * @param {Item} speciesItem
 */
export async function handleSpeciesRemove(actor, speciesItem) {
    const speciesName = speciesItem.name.toLowerCase();

    // 1. Remove Natural Weapons
    const weaponToRemove = resolveNaturalWeaponForSpecies(speciesName);
    if (weaponToRemove) {
        const weapon = actor.items.find((i) => i.name === weaponToRemove.name);
        if (weapon) {
            await weapon.delete();
            if (typeof ui !== 'undefined') ui.notifications.info(`Removed natural weapon: ${weaponToRemove.name}`);
        }
    }

    // 2. CHECK: Are there any other species left?
    // If we found any species that is NOT the one being deleted (although 'actor.items' might already lack it)
    // In _onDeleteDescendantDocuments, 'actor.items' usually implies the state *after* deletion in memory?
    // Let's rely on finding ANY species. If none, we clean up.
    const remainingSpecies = actor.items.find((i) => i.type === 'species' && i.id !== speciesItem.id);

    if (!remainingSpecies) {
        // 3. Last Species Removed -> RESET STATS
        const updateData = {
            'system.stats.luck.value': 0,
            'system.stats.luck.max': 0,
            'system.stats.flux.value': 0,
            'system.stats.flux.max': 0
            // HP Base is derived from item presence, so no manual reset needed for 'system.hp'?
            // Move is derived from item presence, so no manual reset needed.
        };
        if (typeof ui !== 'undefined') ui.notifications.info(`Species removed: Resetting Stats.`);
        await actor.update(updateData);
    }
}
