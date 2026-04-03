/**
 * Helper functions for preparing item data for actor sheets.
 */

const NON_RELOADABLE_SKILLS = new Set(["melee", "unarmed"]);

/**
 * Prepares and organizes items for display in the actor sheet.
 * @param {Array} items - The actor's items collection.
 * @param {Object} rollData - The actor's roll data for resolving formulas.
 * @returns {Object} Organized item data structure.
 */
export function prepareItems(items, rollData) {
    const buckets = initPrepareItemBuckets();
    classifyItems(items, rollData, buckets);
    sortPreparedBuckets(buckets);
    const nestedDisciplines = buildNestedDisciplines(buckets.disciplines, buckets.ebbFormulas);

    return {
        inventory: buckets.inventory,
        infections: buckets.infections,
        traits: buckets.traits,
        disciplines: nestedDisciplines,
        skillsByStat: buckets.skillsByStat,
        weapons: buckets.combatAttackItems,
        armors: buckets.armors,
        skills: buckets.skills
    };
}

function initPrepareItemBuckets() {
    return {
        inventory: {
            weapon: { label: "Weapons", items: [] },
            armor: { label: "Armor", items: [] },
            explosive: { label: "Explosives", items: [] },
            magazine: { label: "Ammunition", items: [] },
            drug: { label: "Drugs", items: [] },
            item: { label: "Gear", items: [] }
        },
        infections: [],
        traits: [],
        ebbFormulas: [],
        disciplines: [],
        skills: [],
        skillsByStat: {
            str: { label: "STR", items: [] },
            dex: { label: "DEX", items: [] },
            know: { label: "KNOW", items: [] },
            conc: { label: "CONC", items: [] },
            cha: { label: "CHA", items: [] },
            cool: { label: "COOL", items: [] },
            other: { label: "OTHER", items: [] }
        },
        // Includes weapon and explosive attackables; exposed as "weapons" for template compatibility.
        combatAttackItems: [],
        armors: []
    };
}

function classifyItems(items, rollData, buckets) {
    for (const item of items) {
        item.img = item.img || "icons/svg/item-bag.svg";

        if (item.type === "toxicant") {
            buckets.infections.push(item);
        } else if (buckets.inventory[item.type]) {
            buckets.inventory[item.type].items.push(item);
        }

        switch (item.type) {
            case "weapon": {
                const skillKey = (item.system.skill || "").toLowerCase();
                item.isReloadable = !NON_RELOADABLE_SKILLS.has(skillKey);
                item.resolvedDamage = resolveDamage(item.system.damage, item.system.minDamage, rollData);
                buckets.combatAttackItems.push(item);
                break;
            }
            case "explosive":
                item.resolvedDamage = item.system.damage;
                buckets.combatAttackItems.push(item);
                break;
            case "armor":
                buckets.armors.push(item);
                break;
            case "trait":
                buckets.traits.push(item);
                break;
            case "ebbFormula":
                buckets.ebbFormulas.push(item);
                break;
            case "discipline":
                buckets.disciplines.push(item);
                break;
            case "skill": {
                const stat = (item.system.stat || "dex").toLowerCase();
                (buckets.skillsByStat[stat] || buckets.skillsByStat.other).items.push(item);
                buckets.skills.push(item);
                break;
            }
        }
    }
}

function sortPreparedBuckets(buckets) {
    const sortFn = (a, b) => a.name.localeCompare(b.name);
    const sortIfNeeded = (list) => {
        if (list.length > 1) list.sort(sortFn);
    };

    for (const category of Object.values(buckets.inventory)) {
        sortIfNeeded(category.items);
    }
    sortIfNeeded(buckets.infections);
    sortIfNeeded(buckets.traits);
    sortIfNeeded(buckets.ebbFormulas);
    sortIfNeeded(buckets.disciplines);
    sortIfNeeded(buckets.combatAttackItems);
    sortIfNeeded(buckets.armors);
    sortIfNeeded(buckets.skills);
    for (const bucket of Object.values(buckets.skillsByStat)) {
        sortIfNeeded(bucket.items);
    }
}

function buildNestedDisciplines(disciplines, ebbFormulas) {
    const configDis = CONFIG.SLA?.disciplineSkills || {};
    const nestedDisciplines = [];
    const disciplineByName = new Map();

    for (const discipline of disciplines) {
        discipline.formulas = [];
        nestedDisciplines.push(discipline);

        const nameKey = (discipline.name || "").toLowerCase();
        if (nameKey && !disciplineByName.has(nameKey)) {
            disciplineByName.set(nameKey, discipline);
        }
    }

    for (const formula of ebbFormulas) {
        const rawKey = formula.system.discipline || "";
        const key = rawKey.toLowerCase();
        const label = configDis[rawKey] || configDis[key];
        const labelKey = (label || "").toLowerCase();
        const parent = disciplineByName.get(key) || disciplineByName.get(labelKey);
        if (parent) parent.formulas.push(formula);
    }

    return nestedDisciplines;
}

/**
 * Resolves a damage formula string to a numeric value or keeps the formula.
 * @param {string|number} dmg - The damage value or formula.
 * @param {number} minDamage - Minimum damage value.
 * @param {Object} rollData - Roll data for formula resolution.
 * @returns {string|number} Resolved damage value or original formula.
 */
function resolveDamage(dmg, minDamage, rollData) {
    try {
        const dmgStr = String(dmg || "0");
        const minDmg = Math.max(0, Number(minDamage) || 0);
        
        // Check if it contains dice (e.g., "1d6", "2d4+1")
        if (dmgStr.includes("d")) {
            // Keep formula if dice present (minDamage will be enforced during roll)
            return dmgStr;
        }
        
        // Check if it contains a variable (e.g. @stats) or math operators
        if (typeof dmg === "string" && (dmgStr.includes("@") || dmgStr.match(/[+\-*\/]/))) {
            // Resolve formula with variables
            const resolvedFormula = Roll.replaceFormulaData(dmgStr, rollData);
            // Evaluate math string
            let total = Math.round(Number(Function('"use strict";return (' + resolvedFormula + ')')()));

            // CHECK MIN DAMAGE
            if (!isNaN(total)) {
                total = Math.max(0, total); // Never allow negative damage
                if (total < minDmg) {
                    total = minDmg;
                }
            }

            return isNaN(total) ? dmgStr : total;
        } else {
            // Static damage value (no formula, no dice)
            // Convert to number and apply minDamage
            let total = Number(dmg);
            if (isNaN(total)) {
                // If conversion fails, return original
                return dmg;
            }
            
            // Apply minDamage to static values
            total = Math.max(0, total); // Never allow negative damage
            if (total < minDmg) {
                total = minDmg;
            }
            
            return total;
        }
    } catch (err) {
        console.warn(`SLA | Failed to resolve damage`, err);
        return dmg;
    }
}

