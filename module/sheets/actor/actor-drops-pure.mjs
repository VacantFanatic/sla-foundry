/**
 * Pure actor drop helpers (unit tested).
 */

/**
 * @param {Record<string, number>} requirements
 * @param {Record<string, { value?: number }>} stats
 */
export function validatePackageRequirements(requirements, stats) {
    for (const [key, minVal] of Object.entries(requirements ?? {})) {
        const actorStat = stats?.[key]?.value || 0;
        if (actorStat < minVal) {
            return { valid: false, failedKey: key, minVal };
        }
    }
    return { valid: true };
}

/**
 * @param {Record<string, number|{ min?: number }>} speciesStats
 */
export function buildSpeciesStatUpdates(speciesStats) {
    const updates = {};
    if (!speciesStats) return updates;
    for (const [key, val] of Object.entries(speciesStats)) {
        const valueToSet = typeof val === 'object' && val?.min !== undefined ? val.min : val;
        updates[`system.stats.${key}.value`] = valueToSet;
    }
    return updates;
}

/**
 * @param {string} actorType
 * @param {string} itemType
 */
export function shouldAutoEquipDroppedItem(actorType, itemType) {
    return (
        (actorType === 'npc' && ['weapon', 'armor'].includes(itemType)) ||
        (actorType === 'vehicle' && itemType === 'weapon')
    );
}

/**
 * @param {object} skillData
 * @param {string} sourceFlag
 * @param {Record<string, string>} [skillStatsConfig]
 */
export function buildGrantedSkillPayload(skillData, sourceFlag, skillStatsConfig = {}) {
    return {
        name: skillData.name,
        type: 'skill',
        img: skillData.img || 'icons/svg/book.svg',
        system: {
            rank: '1',
            stat: skillStatsConfig[skillData.name?.toLowerCase()] || skillData.stat || skillData.system?.stat || 'dex',
            description: skillData.system?.description || ''
        },
        flags: {
            'sla-industries': {
                [sourceFlag]: true
            }
        }
    };
}
