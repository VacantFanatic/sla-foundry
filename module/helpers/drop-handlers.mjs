/**
 * Helper functions for handling item drop operations.
 */

/**
 * Parses drop data from an event.
 * @param {Event} event - The drop event.
 * @param {boolean} useOriginalEvent - Whether to use originalEvent (for jQuery events).
 * @returns {Object|null} Parsed drop data or null if invalid.
 */
async function parseDropData(event, useOriginalEvent = false) {
    try {
        const dataTransfer = useOriginalEvent ? event.originalEvent.dataTransfer : event.dataTransfer;
        const data = JSON.parse(dataTransfer.getData('text/plain'));
        
        if (data.type !== "Item") return null;
        
        return await Item.implementation.fromDropData(data);
    } catch (err) {
        console.error("SLA | Drop Data Parse Failed:", err);
        return null;
    }
}

/**
 * Handles dropping a weapon item to link to a magazine.
 * @param {Event} event - The drop event.
 * @param {Item} targetItem - The magazine item being updated.
 * @returns {Promise<boolean>} True if successful, false otherwise.
 */
export async function handleWeaponDrop(event, targetItem) {
    event.preventDefault();
    
    const item = await parseDropData(event);
    if (!item || item.type !== "weapon") {
        ui.notifications.warn("Only Weapons can be linked to a Magazine.");
        return false;
    }

    await targetItem.update({ "system.linkedWeapon": item.name });
    ui.notifications.info(`Linked Magazine to: ${item.name}`);
    return true;
}

/**
 * Handles dropping a skill item to link to a weapon.
 * @param {Event} event - The drop event (jQuery wrapped).
 * @param {Item} targetItem - The weapon item being updated.
 * @returns {Promise<boolean>} True if successful, false otherwise.
 */
export async function handleWeaponSkillDrop(event, targetItem) {
    event.preventDefault();
    
    const item = await parseDropData(event, true);
    if (!item || item.type !== "skill") {
        ui.notifications.warn("Only 'Skill' items can be linked.");
        return false;
    }

    await targetItem.update({ "system.skill": item.name });
    return true;
}

/**
 * Handles dropping a discipline item to link to an Ebb Formula.
 * @param {Event} event - The drop event.
 * @param {Item} targetItem - The ebb formula item being updated.
 * @returns {Promise<boolean>} True if successful, false otherwise.
 */
export async function handleDisciplineDrop(event, targetItem) {
    event.preventDefault();
    event.stopPropagation();
    
    const item = await parseDropData(event);
    if (!item || item.type !== "discipline") {
        ui.notifications.warn("Only 'Discipline' items can be linked here.");
        return false;
    }

    await targetItem.update({ "system.discipline": item.name });
    return true;
}

/**
 * Normalizes skill data to ensure proper structure.
 * @param {Array|string|Object} skills - The skills array or single skill.
 * @returns {Array} Normalized skills array.
 */
function normalizeSkills(skills) {
    if (!Array.isArray(skills)) {
        return [];
    }

    return skills.map(s => {
        if (typeof s === "string") {
            return {
                name: s,
                rank: 1,
                img: "icons/svg/item-bag.svg",
                stat: "dex"
            };
        }
        // Ensure existing objects have stat
        if (!s.stat) s.stat = "dex";
        return s;
    });
}

/**
 * Handles dropping a skill item to add to a species/package list.
 * @param {Event} event - The drop event (jQuery wrapped).
 * @param {Item} targetItem - The species/package item being updated.
 * @returns {Promise<boolean>} True if successful, false otherwise.
 */
export async function handleSkillDrop(event, targetItem) {
    event.preventDefault();
    
    const item = await parseDropData(event, true);
    if (!item || item.type !== "skill") {
        ui.notifications.warn("Only Skills can be added to this list.");
        return false;
    }

    // Get and normalize current skills
    let currentSkills = targetItem.system.skills || [];
    const cleanSkills = normalizeSkills(currentSkills);

    // Build new skill data
    const newSkill = {
        name: item.name,
        rank: item.system.rank || 1,
        img: item.img || "icons/svg/item-bag.svg",
        stat: item.system.stat || "dex"
    };

    // Check for duplicates
    if (cleanSkills.some(s => s.name === newSkill.name)) {
        ui.notifications.warn(`${newSkill.name} is already in the list.`);
        return false;
    }

    // Update the item
    const newArray = [...cleanSkills, newSkill];
    await targetItem.update({ "system.skills": newArray });
    return true;
}

/**
 * Handles deleting a skill from a species/package list.
 * @param {number} index - The index of the skill to delete.
 * @param {Item} targetItem - The species/package item being updated.
 * @returns {Promise<void>}
 */
export async function handleSkillDelete(index, targetItem) {
    const currentSkills = targetItem.system.skills || [];
    
    // Filter out the specific index and normalize remainder
    const newArray = currentSkills
        .filter((_, i) => i !== index)
        .map(s => {
            if (typeof s === "string") {
                return { name: s, rank: 1, img: "icons/svg/item-bag.svg" };
            }
            return s;
        });

    await targetItem.update({ "system.skills": newArray });
}

