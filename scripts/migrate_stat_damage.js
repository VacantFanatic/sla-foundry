import { NATURAL_WEAPONS } from "../module/data/natural-weapons.mjs";

export async function migrateNaturalWeapons(silent = false) {
    console.log("SLA | Starting Natural Weapons Migration...");
    const actors = game.actors.contents;
    let updateCount = 0;
    let createdCount = 0;

    for (const actor of actors) {
        const itemsToDelete = [];
        const itemsToCreate = [];

        // 1. IDENTIFY BAD ITEMS
        const weapons = actor.items.filter(i => i.type === "weapon");

        for (const item of weapons) {
            let isLegacy = false;
            let replacementData = null;

            // 1. Stormer Teeth/Claws
            if (item.name === "Teeth/Claws (Stormer)" && item.system.damage.includes("1d10")) {
                isLegacy = true;
                replacementData = foundry.utils.deepClone(NATURAL_WEAPONS.teethClaws);
            }
            // 2. Neophron Beak
            else if (item.name === "Beak (Neophron)" && item.system.damage.includes("1d10")) {
                isLegacy = true;
                replacementData = foundry.utils.deepClone(NATURAL_WEAPONS.beak);
            }
            // 3. Punch/Kick (Legacy)
            else if (item.name === "Punch/Kick" && item.system.damage.includes("1d10")) {
                isLegacy = true;
                // We don't need to explicitly push to itemsToCreate for Punch/Kick 
                // because the "ENSURE" block below will handle it if it's missing.
                // But specifically for consistency let's rely on the block below for Punch/Kick.
            }

            if (isLegacy) {
                console.log(`SLA | Identifying Legacy Item for Replacement: ${actor.name} - ${item.name}`);
                itemsToDelete.push(item.id);
                if (replacementData) itemsToCreate.push(replacementData);
            }
        }

        // 2. EXECUTE DELETES
        if (itemsToDelete.length > 0) {
            await actor.deleteEmbeddedDocuments("Item", itemsToDelete);
            updateCount += itemsToDelete.length; // Counting deletions as "updates" to the actor state
        }

        // 3. EXECUTE RE-CREATES (Specific Species Weapons)
        if (itemsToCreate.length > 0) {
            await actor.createEmbeddedDocuments("Item", itemsToCreate);
            createdCount += itemsToCreate.length;
        }

        // 4. ENSURE PUNCH/KICK EXISTS (Handles both missing AND deleted-legacy cases)
        if (actor.type === 'character' || actor.type === 'npc') {
            const hasPunch = actor.items.some(i => i.name === "Punch/Kick");
            if (!hasPunch) {
                console.log(`SLA | Adding Punch/Kick to ${actor.name}`);
                const punchData = foundry.utils.deepClone(NATURAL_WEAPONS.punchKick);
                await actor.createEmbeddedDocuments("Item", [punchData]);
                createdCount++;
            }
        }
    }

    if (updateCount > 0 || createdCount > 0) {
        if (!silent) ui.notifications.info(`SLA | Updated ${updateCount} Items. Created ${createdCount} Natural Weapons.`);
        console.log(`SLA | Updated ${updateCount} Items. Created ${createdCount} Natural Weapons.`);
    } else {
        console.log("SLA | No natural weapons needed migration.");
    }
}
