import { NATURAL_WEAPONS } from "../data/natural-weapons.mjs";

/**
 * Detect legacy natural weapon items that should be replaced during world migration.
 * @param {{ type?: string, name?: string, system?: { damage?: string } }} item
 * @returns {{ isLegacy: boolean, replacementKey: "teethClaws" | "beak" | "punchKick" | null }}
 */
export function classifyLegacyNaturalWeapon(item) {
    if (item?.type !== "weapon") {
        return { isLegacy: false, replacementKey: null };
    }

    const damage = item.system?.damage ?? "";
    if (!damage.includes("1d10")) {
        return { isLegacy: false, replacementKey: null };
    }

    if (item.name === "Teeth/Claws (Stormer)") {
        return { isLegacy: true, replacementKey: "teethClaws" };
    }
    if (item.name === "Beak (Neophron)") {
        return { isLegacy: true, replacementKey: "beak" };
    }
    if (item.name === "Punch/Kick") {
        return { isLegacy: true, replacementKey: "punchKick" };
    }

    return { isLegacy: false, replacementKey: null };
}

/**
 * Replace legacy natural weapon embedded items across all world actors.
 * @param {boolean} [silent=false]
 */
export async function migrateNaturalWeapons(silent = false) {
    console.log("SLA | Starting Natural Weapons Migration...");
    const actors = game.actors.contents;
    let updateCount = 0;
    let createdCount = 0;

    for (const actor of actors) {
        const itemsToDelete = [];
        const itemsToCreate = [];

        const weapons = actor.items.filter((i) => i.type === "weapon");

        for (const item of weapons) {
            const { isLegacy, replacementKey } = classifyLegacyNaturalWeapon(item);
            if (!isLegacy) continue;

            console.log(`SLA | Identifying Legacy Item for Replacement: ${actor.name} - ${item.name}`);
            itemsToDelete.push(item.id);

            if (replacementKey === "teethClaws") {
                itemsToCreate.push(foundry.utils.deepClone(NATURAL_WEAPONS.teethClaws));
            } else if (replacementKey === "beak") {
                itemsToCreate.push(foundry.utils.deepClone(NATURAL_WEAPONS.beak));
            }
        }

        if (itemsToDelete.length > 0) {
            await actor.deleteEmbeddedDocuments("Item", itemsToDelete);
            updateCount += itemsToDelete.length;
        }

        if (itemsToCreate.length > 0) {
            await actor.createEmbeddedDocuments("Item", itemsToCreate);
            createdCount += itemsToCreate.length;
        }

        if (actor.type === "character" || actor.type === "npc") {
            const punchKickItems = actor.items.filter(
                (i) => i.type === "weapon" && i.name === NATURAL_WEAPONS.punchKick.name
            );
            if (punchKickItems.length === 0) {
                console.log(`SLA | Adding Punch/Kick to ${actor.name}`);
                const punchData = foundry.utils.deepClone(NATURAL_WEAPONS.punchKick);
                await actor.createEmbeddedDocuments("Item", [punchData]);
                createdCount++;
            } else if (punchKickItems.length > 1) {
                const duplicateIds = punchKickItems.slice(1).map((i) => i.id);
                if (duplicateIds.length > 0) {
                    console.log(`SLA | Removing duplicate Punch/Kick (${duplicateIds.length}) from ${actor.name}`);
                    await actor.deleteEmbeddedDocuments("Item", duplicateIds);
                    updateCount += duplicateIds.length;
                }
            }
        }
    }

    if (updateCount > 0 || createdCount > 0) {
        if (!silent) {
            ui.notifications.info(`SLA | Updated ${updateCount} Items. Created ${createdCount} Natural Weapons.`);
        }
        console.log(`SLA | Updated ${updateCount} Items. Created ${createdCount} Natural Weapons.`);
    } else {
        console.log("SLA | No natural weapons needed migration.");
    }
}
