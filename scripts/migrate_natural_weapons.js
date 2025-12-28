/**
 * Migration Script: Natural Weapons
 * Adds "Punch/Kick" to all characters/NPCs.
 * Adds "Teeth/Claws (Stormer)" to Stormers.
 * Adds "Beak (Neophron)" to Neophrons.
 */

import { NATURAL_WEAPONS } from "../module/data/natural-weapons.mjs";

console.log("SLA Industries | Starting Natural Weapons Migration...");

let count = 0;
let updated = 0;

for (const actor of game.actors) {
    if (actor.type !== 'character' && actor.type !== 'npc') continue;
    count++;

    const itemsToAdd = [];

    // 1. Check Punch/Kick
    const hasPunchKick = actor.items.find(i => i.name === NATURAL_WEAPONS.punchKick.name);
    if (!hasPunchKick) {
        itemsToAdd.push(NATURAL_WEAPONS.punchKick);
    }

    // 2. Check Species Weapons
    const speciesItem = actor.items.find(i => i.type === 'species');
    if (speciesItem) {
        const speciesName = speciesItem.name.toLowerCase();

        if (speciesName.includes("stormer")) {
            const hasClaws = actor.items.find(i => i.name === NATURAL_WEAPONS.teethClaws.name);
            if (!hasClaws) {
                itemsToAdd.push(NATURAL_WEAPONS.teethClaws);
            }
        } else if (speciesName.includes("neophron")) {
            const hasBeak = actor.items.find(i => i.name === NATURAL_WEAPONS.beak.name);
            if (!hasBeak) {
                itemsToAdd.push(NATURAL_WEAPONS.beak);
            }
        }
    }

    // 3. Update Actor
    if (itemsToAdd.length > 0) {
        console.log(`SLA Industries | Migrating Actor ${actor.name}: Adding ${itemsToAdd.map(i => i.name).join(", ")}`);
        // We use createEmbeddedDocuments which triggers the hooks, but since we are running this script manually or on load, 
        // the hooks we just added might try to run logic. However, our hooks check for 'species' creation/deletion, 
        // whereas here we are adding weapons directly. So it's safe.
        // Also Punch/Kick logic in _preCreate only runs on actor creation, not update.
        await actor.createEmbeddedDocuments("Item", itemsToAdd);
        updated++;
    }
}

ui.notifications.info(`Migration Complete. Checked ${count} actors, updated ${updated}.`);
console.log(`SLA Industries | Migration Complete. Checked ${count} actors, updated ${updated}.`);
