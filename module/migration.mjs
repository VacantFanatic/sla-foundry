import { NATURAL_WEAPONS } from "./data/natural-weapons.mjs";
import { migrateNaturalWeapons } from "../scripts/migrate_stat_damage.js";

/** * module/migration.mjs 
 */

// 1. Define the target version for THIS specific migration
//    (Matches the version in your system.json)
export const CURRENT_MIGRATION_VERSION = "0.18.0";

/**
 * Main Entry Point
 */
export async function migrateWorld() {
    ui.notifications.info(`SLA Industries System: Applying Migration to version ${CURRENT_MIGRATION_VERSION}. Please wait...`, { permanent: true });

    const meleeSkills = ["melee", "unarmed", "thrown"];

    // 1. Migrate World Items
    const worldItems = game.items.contents;
    for (const item of worldItems) {
        if (item.type === "weapon") await migrateWeaponItem(item, meleeSkills);
        if (item.type === "armor") await migrateArmorItem(item);
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

            // Migrate Luck & Flux Max
            const luck = foundry.utils.getProperty(actor, "system.stats.luck");
            if (luck && (luck.max === undefined || luck.max === null)) {
                actorUpdate["system.stats.luck.max"] = 5;
            }

            const flux = foundry.utils.getProperty(actor, "system.stats.flux");
            if (flux && (flux.max === undefined || flux.max === null)) {
                actorUpdate["system.stats.flux.max"] = 10;
            }
        }

        // B. Migrate Embedded Items
        const updates = [];
        const actorItems = actor.items.contents;
        for (const item of actorItems) {
            let updateData = null;
            if (item.type === "weapon") updateData = await getWeaponMigrationData(item, meleeSkills);
            if (item.type === "armor") updateData = await getArmorMigrationData(item);
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