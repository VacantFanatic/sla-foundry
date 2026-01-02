import { NATURAL_WEAPONS } from "./data/natural-weapons.mjs";
import { migrateNaturalWeapons } from "../scripts/migrate_stat_damage.js";

/** * module/migration.mjs 
 */

// 1. Define the target version for THIS specific migration
//    (Matches the version in your system.json)
export const CURRENT_MIGRATION_VERSION = "0.22.0";

/**
 * Main Entry Point
 */
export async function migrateWorld() {
    ui.notifications.info(`SLA Industries System: Applying Migration to version ${CURRENT_MIGRATION_VERSION}. Please wait...`, { permanent: true });

    // Run version-specific migrations
    await migrateTo0210();

    const meleeSkills = ["melee", "unarmed", "thrown"];

    // 1. Migrate World Items
    const worldItems = game.items.contents;
    for (const item of worldItems) {
        if (item.type === "weapon") await migrateWeaponItem(item, meleeSkills);
        if (item.type === "armor") await migrateArmorItem(item);
        if (item.type === "species") await migrateSpeciesItem(item);
    }

    // 2. Migrate Actor Items & Data
    for (const actor of game.actors) {
        let actorUpdate = {};

        // A. Migrate Actor Data (Armor Resist)
        if (actor.type === 'character' || actor.type === 'npc') {
            // Check if resist is a number (old schema)
            const oldResist = foundry.utils.getProperty(actor, "system.armor.resist");
            if (typeof oldResist === "number") {
                console.log(`Migrating Actor Data for ${actor.name}: armor.resist to Schema`);
                actorUpdate["system.armor.resist"] = { value: 0, max: 0 };
            }

            // Migrate NPC Wound and Condition Fields (if missing)
            if (actor.type === 'npc') {
                const wounds = foundry.utils.getProperty(actor, "system.wounds") || {};
                
                // Initialize individual wound fields if missing
                if (wounds.head === undefined) {
                    actorUpdate["system.wounds.head"] = false;
                }
                if (wounds.torso === undefined) {
                    actorUpdate["system.wounds.torso"] = false;
                }
                if (wounds.lArm === undefined) {
                    actorUpdate["system.wounds.lArm"] = false;
                }
                if (wounds.rArm === undefined) {
                    actorUpdate["system.wounds.rArm"] = false;
                }
                if (wounds.lLeg === undefined) {
                    actorUpdate["system.wounds.lLeg"] = false;
                }
                if (wounds.rLeg === undefined) {
                    actorUpdate["system.wounds.rLeg"] = false;
                }

                // Initialize conditions field if missing
                const conditions = foundry.utils.getProperty(actor, "system.conditions");
                if (!conditions || typeof conditions !== 'object') {
                    // Entire conditions object is missing - set it all at once
                    actorUpdate["system.conditions"] = {
                        bleeding: false,
                        burning: false,
                        prone: false,
                        stunned: false,
                        immobile: false,
                        critical: false
                    };
                } else {
                    // Conditions object exists, but individual fields might be missing
                    // Initialize individual condition fields if missing
                    if (conditions.bleeding === undefined) actorUpdate["system.conditions.bleeding"] = false;
                    if (conditions.burning === undefined) actorUpdate["system.conditions.burning"] = false;
                    if (conditions.prone === undefined) actorUpdate["system.conditions.prone"] = false;
                    if (conditions.stunned === undefined) actorUpdate["system.conditions.stunned"] = false;
                    if (conditions.immobile === undefined) actorUpdate["system.conditions.immobile"] = false;
                    if (conditions.critical === undefined) actorUpdate["system.conditions.critical"] = false;
                }

                if (Object.keys(actorUpdate).some(key => key.startsWith("system.wounds.") || key.startsWith("system.conditions"))) {
                    console.log(`Migrating NPC ${actor.name}: Adding wound and condition fields`);
                }
            }

            // Migrate Luck & Flux Max
            const luck = foundry.utils.getProperty(actor, "system.stats.luck");
            const flux = foundry.utils.getProperty(actor, "system.stats.flux");
            const hasLuckMax = luck && (luck.max !== undefined && luck.max !== null);
            const hasFluxMax = flux && (flux.max !== undefined && flux.max !== null);

            if (!hasLuckMax || !hasFluxMax) {
                // Determine species
                const speciesItem = actor.items.find(i => i.type === "species");
                const speciesName = speciesItem ? speciesItem.name.toLowerCase() : "";

                let luckInit = 0;
                let luckMax = 0;
                let fluxInit = 0;
                let fluxMax = 0;

                if (speciesName.includes("ebon")) {
                    // Ebonite: Flux 2/6
                    fluxInit = 2;
                    fluxMax = 6;
                } else if (speciesName.includes("human")) {
                    luckInit = 1;
                    luckMax = 6;
                } else if (speciesName.includes("frother")) {
                    luckInit = 1;
                    luckMax = 3;
                } else if (speciesName.includes("wraithen")) {
                    luckInit = 1;
                    luckMax = 4;
                } else if (speciesName.includes("shaktar") || speciesName.includes("carrien") || speciesName.includes("neophron")) {
                    // Shaktar, Adv. Carrien, Neophron: Luck 0/3
                    luckInit = 0;
                    luckMax = 3;
                } else if (speciesName.includes("stormer")) {
                    // Stormer 313 & 711: Luck 0/2
                    luckInit = 0;
                    luckMax = 2;
                } else {
                    // Default fallback (e.g. unknown species or no species)
                    // If no species, leave as 0 (hidden)
                }

                // Apply Updates if missing
                if (!hasLuckMax) {
                    actorUpdate["system.stats.luck.value"] = luckInit;
                    actorUpdate["system.stats.luck.max"] = luckMax;
                }

                if (!hasFluxMax) {
                    actorUpdate["system.stats.flux.value"] = fluxInit;
                    actorUpdate["system.stats.flux.max"] = fluxMax;
                }
            }
        }

        // B. Migrate Embedded Items
        const updates = [];
        const actorItems = actor.items.contents;
        for (const item of actorItems) {
            let updateData = null;
            if (item.type === "weapon") updateData = await getWeaponMigrationData(item, meleeSkills);
            if (item.type === "armor") updateData = await getArmorMigrationData(item);
            if (item.type === "species") updateData = await getSpeciesMigrationData(item);
            if (updateData) updates.push(updateData);
        }

        // C. Apply Updates
        if (!foundry.utils.isEmpty(actorUpdate)) {
            await actor.update(actorUpdate);
        }

        if (updates.length > 0) {
            console.log(`Migrating Items for ${actor.name}...`);
            await actor.updateEmbeddedDocuments("Item", updates);
        }
    }

    // 3. SPECIAL MIGRATIONS (External Scripts)
    // Run Natural Weapons Migration (Silent Mode)
    await migrateNaturalWeapons(true);

    // 4. Update the Setting so it doesn't run again
    await game.settings.set("sla-industries", "systemMigrationVersion", CURRENT_MIGRATION_VERSION);

    ui.notifications.info("SLA Industries System: Migration Complete!", { permanent: false });
}

/**
 * Migration Logic for Armor
 */
async function migrateArmorItem(item) {
    const updateData = await getArmorMigrationData(item);
    if (updateData) {
        console.log(`Migrating Armor: ${item.name}`);
        await item.update(updateData);
    }
}

/**
 * Get Armor Data Delta
 */
async function getArmorMigrationData(item) {
    const system = item.system;
    const updateData = { _id: item.id };
    let hasChanges = false;

    // Initialize Powered Fields
    if (system.powered === undefined) {
        updateData["system.powered"] = false;
        hasChanges = true;
    }

    if (!system.mods) {
        updateData["system.mods"] = {
            str: 0,
            dex: 0,
            move: { closing: 0, rushing: 0 }
        };
        hasChanges = true;
    }

    return hasChanges ? updateData : null;
}

/**
 * Migration Logic for a single Item
 */
async function migrateWeaponItem(item, meleeSkills) {
    const updateData = await getWeaponMigrationData(item, meleeSkills);
    if (updateData) {
        console.log(`Migrating Item: ${item.name}`);
        await item.update(updateData);
    }
}

/**
 * Calculate the data delta
 */
async function getWeaponMigrationData(item, meleeSkills) {
    const system = item.system;

    // A. Attack Type
    let attackType = system.attackType;
    if (!attackType) {
        const skillName = (system.skill || "").toLowerCase().trim();
        if (meleeSkills.includes(skillName)) attackType = "melee";
        else attackType = "ranged";
    }

    // B. Firing Modes
    let firingModes = system.firingModes;
    if (attackType === "ranged" && (!firingModes || foundry.utils.isEmpty(firingModes))) {
        const oldRecoil = Number(system.recoil) || 0;
        firingModes = {
            single: { label: "Single", active: true, rounds: 1, recoil: 0 },
            burst: { label: "Burst", active: false, rounds: 3, recoil: oldRecoil > 0 ? oldRecoil : 1 },
            auto: { label: "Full Auto", active: false, rounds: 10, recoil: oldRecoil > 0 ? (oldRecoil * 2) : 4 }
        };
    }

    // C. Compile Changes
    const updateData = { _id: item.id };
    let hasChanges = false;

    if (system.attackType !== attackType) {
        updateData["system.attackType"] = attackType;
        hasChanges = true;
    }
    if (firingModes && !foundry.utils.objectsEqual(system.firingModes, firingModes)) {
        updateData["system.firingModes"] = firingModes;
        hasChanges = true;
    }

    return hasChanges ? updateData : null;
}

/**
 * Migration Logic for Species
 */
async function migrateSpeciesItem(item) {
    const updateData = await getSpeciesMigrationData(item);
    if (updateData) {
        console.log(`Migrating Species: ${item.name}`);
        await item.update(updateData);
    }
}

async function getSpeciesMigrationData(item) {
    const system = item.system;
    const updateData = { _id: item.id };
    let hasChanges = false;
    const name = item.name.toLowerCase();

    // Determine target values based on name
    let luckInit = 0, luckMax = 0, fluxInit = 0, fluxMax = 0;
    let hpBase = 10;
    let moveClosing = 0, moveRushing = 0;

    if (name.includes("ebon")) {
        fluxInit = 2; fluxMax = 6;
        hpBase = 14;
        moveClosing = 2; moveRushing = 5;
    } else if (name.includes("human")) {
        luckInit = 1; luckMax = 6;
        hpBase = 14;
        moveClosing = 2; moveRushing = 5;
    } else if (name.includes("frother")) {
        luckInit = 1; luckMax = 3;
        hpBase = 15;
        moveClosing = 2; moveRushing = 5;
    } else if (name.includes("wraithen")) {
        luckInit = 1; luckMax = 4;
        hpBase = 14;
        moveClosing = 4; moveRushing = 8;
    } else if (name.includes("shaktar")) {
        luckInit = 0; luckMax = 3;
        hpBase = 19;
        moveClosing = 3; moveRushing = 6;
    } else if (name.includes("carrien")) { // Advanced Carrien
        luckInit = 0; luckMax = 3;
        hpBase = 20;
        moveClosing = 4; moveRushing = 7;
    } else if (name.includes("neophron")) {
        luckInit = 0; luckMax = 3;
        hpBase = 11;
        moveClosing = 2; moveRushing = 5;
    } else if (name.includes("stormer")) {
        if (name.includes("313") || name.includes("malice")) {
            luckInit = 0; luckMax = 2;
            hpBase = 22;
            moveClosing = 3; moveRushing = 6;
        } else if (name.includes("711") || name.includes("xeno")) {
            luckInit = 0; luckMax = 2;
            hpBase = 20;
            moveClosing = 4; moveRushing = 6;
        } else {
            // Generic Stormer
            luckInit = 0; luckMax = 2;
            hpBase = 20;
            moveClosing = 3; moveRushing = 6;
        }
    }

    // Check if update is needed
    const currLuckInit = system.luck?.initial || 0;
    const currLuckMax = system.luck?.max || 0;
    const currFluxInit = system.flux?.initial || 0;
    const currFluxMax = system.flux?.max || 0;

    if (currLuckInit !== luckInit || currLuckMax !== luckMax) {
        updateData["system.luck.initial"] = luckInit;
        updateData["system.luck.max"] = luckMax;
        hasChanges = true;
    }

    if (currFluxInit !== fluxInit || currFluxMax !== fluxMax) {
        updateData["system.flux.initial"] = fluxInit;
        updateData["system.flux.max"] = fluxMax;
        hasChanges = true;
    }

    // HP BASE
    const currHp = system.hp || 0;
    if (hpBase > 0 && currHp !== hpBase) {
        updateData["system.hp"] = hpBase;
        hasChanges = true;
    }

    // MOVEMENT
    const currClosing = system.move?.closing || 0;
    const currRushing = system.move?.rushing || 0;
    if (moveClosing > 0 && (currClosing !== moveClosing || currRushing !== moveRushing)) {
        updateData["system.move.closing"] = moveClosing;
        updateData["system.move.rushing"] = moveRushing;
        hasChanges = true;
    }

    return hasChanges ? updateData : null;
}

/**
 * Migration for version 0.21.0
 * Handles any data structure changes introduced in this version
 */
async function migrateTo0210() {
    // Version 0.21.0: Code refactoring and CSS optimization
    // No data structure changes required
    // This migration function is a placeholder for future migrations
    
    // If any data migrations are needed in the future, add them here
    // For now, this version only includes code refactoring improvements
    
    console.log("SLA Industries | Migration 0.21.0: Code refactoring (no data changes required)");
}