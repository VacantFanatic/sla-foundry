/**
 * Migration Script: Restore Natural Weapons
 * 
 * Iterates through all actors and:
 * 1. Adds "Punch/Kick" if missing.
 * 2. Adds Species-Specific natural weapons if missing (based on Species item).
 */
export async function migrateNaturalWeapons() {
    console.log("Starting Natural Weapon Migration...");
    let updateCount = 0;

    // Ensure CONFIG is available (it should be in game context)
    const naturalWeapons = CONFIG.SLA?.naturalWeapons;
    if (!naturalWeapons) {
        ui.notifications.error("CONFIG.SLA.naturalWeapons is missing. Reload or check config.mjs.");
        return;
    }

    for (const actor of game.actors) {
        let created = false;

        // 1. Check Punch/Kick
        const punch = actor.items.find(i => i.name === naturalWeapons.punchKick.name);
        if (!punch) {
            console.log(`[Migration] Adding ${naturalWeapons.punchKick.name} to ${actor.name}`);
            await actor.createEmbeddedDocuments("Item", [naturalWeapons.punchKick]);
            created = true;
        }

        // 2. Check Species Weapon
        const speciesItem = actor.items.find(i => i.type === "species");
        if (speciesItem) {
            const speciesName = speciesItem.name.toLowerCase();
            let weaponConfig = null;

            // Simple matching logic mirroring actor.mjs
            if (speciesName.includes("stormer")) weaponConfig = naturalWeapons.teethClaws;
            else if (speciesName.includes("neophron")) weaponConfig = naturalWeapons.beak;

            if (weaponConfig) {
                const existing = actor.items.find(i => i.name === weaponConfig.name);
                if (!existing) {
                    console.log(`[Migration] Adding ${weaponConfig.name} to ${actor.name}`);
                    await actor.createEmbeddedDocuments("Item", [weaponConfig]);
                    created = true;
                }
            }
        }

        if (created) updateCount++;
    }

    const msg = `Migration Complete. Updated ${updateCount} actors.`;
    console.log(msg);
    ui.notifications.info(msg);
}

// Make it globally accessible for easy console execution
window.migrateNaturalWeapons = migrateNaturalWeapons;
