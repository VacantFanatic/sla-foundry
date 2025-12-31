/**
 * Helper functions for SLA Industries dice rolling logic.
 */

/**
 * Calculates the success state of a roll.
 * @param {Roll} roll - The Foundry Roll object.
 * @param {number} baseModifier - The numeric modifier added to dice results.
 * @param {number} tn - Target Number (default 10).
 * @param {object} options - Additional options (e.g. luck bonus).
 * @returns {object} { isSuccess, total, skillHits, skillDiceData, sdRaw, successThroughExperience }
 */
export function calculateRollResult(roll, baseModifier, tn = 10, options = {}) {
    const luckBonus = options.luckBonus || 0;
    const autoSkillSuccesses = options.autoSkillSuccesses || 0;
    const successDieModifier = options.successDieModifier || 0;

    // 1. Success Die (Term 0)
    // Safety check for empty terms
    if (!roll.terms || roll.terms.length === 0) return { isSuccess: false, total: 0 };

    const firstTerm = roll.terms[0];
    // Handle case where term might not have results yet (shouldn't happen if evaluated)
    const sdRaw = (firstTerm.results && firstTerm.results.length > 0) ? firstTerm.results[0].result : 0;

    // Total calculation
    const sdTotal = sdRaw + baseModifier + luckBonus + successDieModifier;
    let isSuccess = sdTotal >= tn;

    // 2. Skill Dice (Term 2 usually)
    let skillHits = 0;
    let skillDiceData = [];

    if (roll.terms.length > 2 && roll.terms[2].results) {
        roll.terms[2].results.forEach(r => {
            let val = r.result + baseModifier;
            let isHit = val >= tn;
            if (isHit) skillHits++;

            skillDiceData.push({
                raw: r.result,
                total: val,
                borderColor: isHit ? "#39ff14" : "#555",
                textColor: isHit ? "#39ff14" : "#ccc"
            });
        });
    }

    // Add auto/guaranteed hits (e.g. Concentration)
    skillHits += autoSkillSuccesses;

    // 3. Success Through Experience
    let successThroughExperience = false;
    if (!isSuccess && skillHits >= 4) {
        isSuccess = true;
        successThroughExperience = true;
    }

    return {
        isSuccess,
        total: sdTotal,
        sdRaw,
        skillHits,
        skillDiceData,
        successThroughExperience
    };
}

/**
 * Determines the Margin of Success (MOS) effects.
 * @param {object} result - The result object from calculateRollResult.
 * @returns {object} { effect, damageBonus, hasChoice, choiceType, choiceDmg }
 */
export function getMOS(result) {
    const { isSuccess, skillHits, successThroughExperience } = result;

    let mosDamageBonus = 0;
    let mosEffectText = isSuccess ? "Standard Hit" : "Failed";
    let mosChoiceData = { hasChoice: false, choiceType: "", choiceDmg: 0 };

    if (isSuccess && !successThroughExperience) {
        if (skillHits === 1) {
            mosDamageBonus = 1;
            mosEffectText = "+1 Damage";
        } else if (skillHits === 2) {
            mosEffectText = "MOS 2: Choose Effect";
            mosChoiceData = { hasChoice: true, choiceType: "arm", choiceDmg: 2 };
        } else if (skillHits === 3) {
            mosEffectText = "MOS 3: Choose Effect";
            mosChoiceData = { hasChoice: true, choiceType: "leg", choiceDmg: 4 };
        } else if (skillHits >= 4) {
            mosDamageBonus = 6;
            mosEffectText = "<strong style='color:#ff5555'>HEAD SHOT</strong> (+6 DMG)";
        }
    } else if (successThroughExperience) {
        mosEffectText = "Success Through Experience";
    }

    return {
        effect: mosEffectText,
        damageBonus: mosDamageBonus,
        ...mosChoiceData
    };
}

/**
 * Generates the HTML tooltip for the roll.
 * @param {Roll} roll - The roll object.
 * @param {number} baseModifier - The skill/stat modifier.
 * @param {number} luckBonus - Any extra luck added to the success die.
 * @param {number} successDieMod - Additional modifier specific to the success die.
 * @returns {string} HTML string.
 */
export function generateDiceTooltip(roll, baseModifier, luckBonus = 0, successDieMod = 0) {
    const sdRaw = (roll.terms[0] && roll.terms[0].results[0]) ? roll.terms[0].results[0].result : 0;
    const sdTotal = sdRaw + baseModifier + luckBonus + successDieMod;

    let html = `<div class="dice-tooltip" style="display:none; margin-top:10px; padding-top:5px; border-top:1px solid #444; font-size:0.8em; color:#ccc;">`;
    html += `<div><strong>Success Die:</strong> Raw ${sdRaw} + Base ${baseModifier}`;
    if (luckBonus > 0) html += ` + Luck ${luckBonus}`;
    if (successDieMod !== 0) html += ` + Mod ${successDieMod}`;
    html += ` = <strong>${sdTotal}</strong></div>`;

    if ((roll.terms.length > 2 && roll.terms[2].results) || (roll.autoSkillSuccesses > 0)) { // Check for auto hits too
        html += `<div style="border-top:1px dashed #444; margin-top:2px;"><strong>Skill Dice (Base ${baseModifier}):</strong></div>`;
        html += `<div style="display:flex; flex-wrap:wrap; gap:5px; margin-top:2px;">`;

        // Render Rolled Dice
        if (roll.terms.length > 2 && roll.terms[2].results) {
            roll.terms[2].results.forEach(r => {
                html += `<span style="background:#222; border:1px solid #555; padding:1px 4px;">${r.result} + ${baseModifier} = <strong>${r.result + baseModifier}</strong></span>`;
            });
        }

        // Render Auto Successes (Green Plus)
        const autoHits = roll.autoSkillSuccesses || 0;
        for (let i = 0; i < autoHits; i++) {
            html += `<span style="background:#222; border:1px solid #39ff14; color:#39ff14; padding:1px 4px; font-weight:bold;">+ Auto</span>`;
        }

        html += `</div>`;
    }
    html += `</div>`;
    return html;
}

/**
 * Creates a standard SLA Roll (1d10 + Xd10) with visual styling.
 * @param {string} formula - The roll formula (e.g. "1d10 + 2d10").
 * @returns {Roll} The constructed Roll object (evaluated if you call evaluate() on it).
 */
export function createSLARoll(formula) {
    let roll = new Roll(formula);

    // --- DICE SO NICE: FORCE BLACK SUCCESS DIE ---
    // Target the first term (1d10)
    if (roll.terms.length > 0 && (roll.terms[0] instanceof foundry.dice.terms.Die || roll.terms[0].constructor.name === "Die")) {
        roll.terms[0].options.appearance = {
            foreground: "#FFFFFF", // White Text
            background: "#000000", // Black Body
            edge: "#333333"        // Dark Grey Outline
        };
    }
    return roll;
}
