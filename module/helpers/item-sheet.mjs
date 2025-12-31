/**
 * Helper functions for item sheet data preparation and operations.
 */

/**
 * Prepares firing modes data for weapon items.
 * Always returns all known firing modes, using source data if available,
 * or default values if not.
 * @param {Object} itemSystem - The item's system data.
 * @returns {Object} Prepared firing modes object.
 */
export function prepareFiringModes(itemSystem) {
    const firingModes = {};
    const knownModes = {
        single: { label: "Single", active: true, rounds: 1, recoil: 0 },
        burst: { label: "Burst", active: false, rounds: 3, recoil: 0 },
        auto: { label: "Full-Auto", active: false, rounds: 10, recoil: 0 },
        suppressive: { label: "Suppressive", active: false, rounds: 20, recoil: 0 }
    };
    const sourceModes = itemSystem.toObject().firingModes || {};

    // Always return all known modes, merging with source data if available
    for (const [key, defaults] of Object.entries(knownModes)) {
        firingModes[key] = {
            ...defaults,
            ...(sourceModes[key] || {}),
            id: key
        };
    }

    return firingModes;
}

/**
 * Finds the linked discipline image for an Ebb Formula item.
 * @param {Item} item - The ebb formula item.
 * @returns {string} The image path for the linked discipline.
 */
export function getLinkedDisciplineImage(item) {
    if (!item.actor || !item.system.discipline) {
        return "icons/svg/item-bag.svg";
    }

    const disciplineItem = item.actor.items.find(i =>
        i.type === "discipline" &&
        i.name.toLowerCase() === item.system.discipline.toLowerCase()
    );

    return disciplineItem ? disciplineItem.img : "icons/svg/item-bag.svg";
}

/**
 * Enriches item description HTML.
 * @param {Item} item - The item to enrich description for.
 * @returns {Promise<string>} Enriched HTML string.
 */
export async function enrichItemDescription(item) {
    return await foundry.applications.ux.TextEditor.implementation.enrichHTML(
        item.system.description,
        {
            secrets: item.isOwner,
            relativeTo: item
        }
    );
}

