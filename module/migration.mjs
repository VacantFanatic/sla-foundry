/** * module/migration.mjs 
 */

// 1. Define the target version for THIS specific migration
//    (Matches the version in your system.json)
export const CURRENT_MIGRATION_VERSION = "0.7.0-alpha"; 

/**
 * Main Entry Point
 */
export async function migrateWorld() {
    ui.notifications.info(`SLA Industries System: Applying Migration to version ${CURRENT_MIGRATION_VERSION}. Please wait...`, {permanent: true});

    const meleeSkills = ["melee", "unarmed", "thrown"];

    // 1. Migrate World Items
    const worldItems = game.items.filter(i => i.type === "weapon");
    for (const item of worldItems) {
        await migrateWeaponItem(item, meleeSkills);
    }

    // 2. Migrate Actor Items
    for (const actor of game.actors) {
        const actorWeapons = actor.items.filter(i => i.type === "weapon");
        if (actorWeapons.length > 0) {
            const updates = [];
            for (const item of actorWeapons) {
                const updateData = await getWeaponMigrationData(item, meleeSkills);
                if (updateData) updates.push(updateData);
            }
            if (updates.length > 0) {
                console.log(`Migrating ${actor.name}...`);
                await actor.updateEmbeddedDocuments("Item", updates);
            }
        }
    }

    // 3. Update the Setting so it doesn't run again
    await game.settings.set("sla-industries", "systemMigrationVersion", CURRENT_MIGRATION_VERSION);
    
    ui.notifications.info("SLA Industries System: Migration Complete!", {permanent: false});
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