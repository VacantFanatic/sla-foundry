/**
 * Helper functions for preparing item data for actor sheets.
 */

/**
 * Prepares and organizes items for display in the actor sheet.
 * @param {Array} items - The actor's items collection.
 * @param {Object} rollData - The actor's roll data for resolving formulas.
 * @returns {Object} Organized item data structure.
 */
export function prepareItems(items, rollData) {
    // 1. Initialize Containers
    const inventory = {
        weapon: { label: "Weapons", items: [] },
        armor: { label: "Armor", items: [] },
        explosive: { label: "Explosives", items: [] },
        magazine: { label: "Ammunition", items: [] },
        drug: { label: "Drugs", items: [] },
        item: { label: "Gear", items: [] }
    };

    const traits = [];
    const ebbFormulas = [];
    const disciplines = [];
    const skills = [];

    // Skill Buckets
    const skillsByStat = {
        "str": { label: "STR", items: [] },
        "dex": { label: "DEX", items: [] },
        "know": { label: "KNOW", items: [] },
        "conc": { label: "CONC", items: [] },
        "cha": { label: "CHA", items: [] },
        "cool": { label: "COOL", items: [] },
        "other": { label: "OTHER", items: [] }
    };

    // Separate Arrays for Combat Tab
    const weapons = [];
    const armors = [];

    // 2. Sort Items into Containers
    for (let i of items) {
        i.img = i.img || "icons/svg/item-bag.svg";

        // INVENTORY GROUPS
        if (inventory[i.type]) {
            inventory[i.type].items.push(i);
        }

        // COMBAT TAB SPECIFIC
        if (i.type === 'weapon') {
            // Hide reload button if skill is melee or unarmed
            const skillKey = (i.system.skill || "").toLowerCase();
            i.isReloadable = !["melee", "unarmed"].includes(skillKey);

            weapons.push(i);

            // Resolve Display Damage
            i.resolvedDamage = resolveDamage(i.system.damage, i.system.minDamage, rollData);
        }

        if (i.type === 'explosive') {
            weapons.push(i); // Add to combat tab
            i.resolvedDamage = i.system.damage;
        }

        if (i.type === 'armor') armors.push(i);

        // OTHER ITEMS
        if (i.type === 'trait') traits.push(i);
        else if (i.type === 'ebbFormula') ebbFormulas.push(i);
        else if (i.type === 'discipline') disciplines.push(i);
        else if (i.type === 'skill') {
            const stat = (i.system.stat || "dex").toLowerCase();
            if (skillsByStat[stat]) skillsByStat[stat].items.push(i);
            else skillsByStat["other"].items.push(i);
            skills.push(i);
        }
    }

    // 3. Sorting Function (Alphabetical)
    const sortFn = (a, b) => a.name.localeCompare(b.name);

    // Sort every list
    Object.values(inventory).forEach(cat => cat.items.sort(sortFn));
    traits.sort(sortFn);
    ebbFormulas.sort(sortFn);
    disciplines.sort(sortFn);
    weapons.sort(sortFn);
    armors.sort(sortFn);
    skills.sort(sortFn);

    for (const key in skillsByStat) {
        skillsByStat[key].items.sort(sortFn);
    }

    // 4. Ebb Nesting Logic
    const configDis = CONFIG.SLA?.disciplineSkills || {};
    const nestedDisciplines = [];
    const rawFormulas = [...ebbFormulas];

    disciplines.forEach(d => {
        d.formulas = [];
        nestedDisciplines.push(d);
    });

    rawFormulas.forEach(f => {
        const rawKey = f.system.discipline || "";
        const key = rawKey.toLowerCase();

        // Find parent where Name matches Key OR Name matches Config Label
        const parent = nestedDisciplines.find(d => {
            const dName = d.name.toLowerCase();
            // Check 1: Direct Match (case-insensitive)
            if (dName === key) return true;

            // Check 2: Config Match
            const label = configDis[rawKey] || configDis[key];
            if (label && dName === label.toLowerCase()) return true;

            return false;
        });

        if (parent) parent.formulas.push(f);
    });

    // 5. Return Organized Data
    return {
        inventory,
        traits,
        disciplines: nestedDisciplines,
        skillsByStat,
        weapons,
        armors,
        skills
    };
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

