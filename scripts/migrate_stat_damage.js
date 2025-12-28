export async function migrateNaturalWeapons() {
    console.log("SLA | Starting Natural Weapons Migration...");
    const actors = game.actors.contents;
    let updateCount = 0;

    for (const actor of actors) {
        const updates = [];

        // Find Candidate Items
        const weapons = actor.items.filter(i => i.type === "weapon");

        for (const item of weapons) {
            let newDamage = null;

            // 1. Stormer Teeth/Claws
            if (item.name === "Teeth/Claws (Stormer)" && item.system.damage.includes("1d10")) {
                newDamage = "@stats.str.value - 1";
            }
            // 2. Neophron Beak
            else if (item.name === "Beak (Neophron)" && item.system.damage.includes("1d10")) {
                newDamage = "@stats.str.value - 1";
            }

            if (newDamage) {
                console.log(`SLA | Migrating ${actor.name}: ${item.name} -> ${newDamage}`);
                updates.push({ _id: item.id, "system.damage": newDamage });
            }
        }

        if (updates.length > 0) {
            await actor.updateEmbeddedDocuments("Item", updates);
            updateCount += updates.length;
        }
    }

    if (updateCount > 0) {
        ui.notifications.info(`SLA | Migrated ${updateCount} Natural Weapons.`);
    } else {
        console.log("SLA | No natural weapons needed migration.");
    }
}
