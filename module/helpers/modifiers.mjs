/**
 * Helper functions for calculating attack modifiers (melee and ranged).
 */

/**
 * Applies melee-specific modifiers to the attack.
 * @param {HTMLFormElement} form - The attack dialog form.
 * @param {number} strValue - The actor's STR stat value.
 * @param {Object} mods - The modifiers object to update.
 */
export function applyMeleeModifiers(form, strValue, mods) {
    // STR Bonus (Rulebook: STR 1-4 = no modifier, STR 5 = +1, STR 6 = +2, STR 7+ = +4)
    if (strValue >= 7) mods.damage += 4;
    else if (strValue === 6) mods.damage += 2;
    else if (strValue === 5) mods.damage += 1;
    // STR 1-4: No modifier (implicit)

    // Checkboxes (Hand-to-Hand Attack Modifiers)
    // Charging: -1 to Success Die and +1 Skill Die success
    if (form.charging?.checked) { 
        mods.successDie -= 1; 
        mods.autoSkillSuccesses += 1; 
    }
    // Target charged you OR moved more than Closing speed: -1 to Success Die
    if (form.targetCharged?.checked) mods.successDie -= 1;
    // Successfully hit same target last round: +1 to Success Die
    if (form.sameTarget?.checked) mods.successDie += 1;
    // Target performing Break Off: +1 to Success Die
    if (form.breakOff?.checked) mods.successDie += 1;
    // Attacking with natural weapons: +1 to Success Die
    if (form.natural?.checked) mods.successDie += 1;
    // Target Prone/Stunned/Immobile: +2 to Success Die
    if (form.prone?.checked) mods.successDie += 2;

    // Read Reserved Dice Input
    mods.reservedDice = Number(form.reservedDice?.value) || 0;

    // Defense Inputs
    // Combat Defence: -1 to all dice per rank
    mods.allDice -= (Number(form.combatDef?.value) || 0);
    // Acrobatic Defence: -2 to all dice per rank
    mods.allDice -= ((Number(form.acroDef?.value) || 0) * 2);
}

/**
 * Applies ranged-specific modifiers to the attack.
 * @param {Item} item - The weapon item.
 * @param {HTMLFormElement} form - The attack dialog form.
 * @param {Object} mods - The modifiers object to update.
 * @param {Array} notes - Array to add modifier notes to.
 * @param {Object} flags - Flags object for special effects (ROF rerolls).
 * @returns {Promise<boolean>} Returns false if the attack should be cancelled.
 */
export async function applyRangedModifiers(item, form, mods, notes, flags) {
    const modeSelect = $(form).find('#fire-mode').find(':selected');
    const modeKey = modeSelect.val() || "single";

    const roundsUsed = parseInt(modeSelect.data("rounds")) || 1;
    const recoilPenalty = parseInt(modeSelect.data("recoil")) || 0;

    // Read 'ammo' directly as a number
    const currentAmmo = Number(item.system.ammo) || 0;

    // 1. VALIDATE AMMO RULES
    const activeModes = Object.values(item.system.firingModes || {}).filter(m => m.active);
    const minDeviceRounds = activeModes.reduce((min, m) => Math.min(min, m.rounds), 999);

    // Rule A: Not enough ammo
    if (currentAmmo < roundsUsed) {
        // Rule B: Only allow if this is the lowest mode
        if (roundsUsed > minDeviceRounds) {
            ui.notifications.error(`Not enough ammo for ${modeSelect.text().split('(')[0].trim()}. Switch to a lower mode.`);
            return false; // STOP THE ROLL
        }

        // Rule C: Lowest mode penalty
        mods.damage -= 2;
        notes.push("Low Ammo (-2 DMG).");

        const minDmg = item.system.minDamage || "0";
        if (minDmg !== "0") notes.push(`(Min DMG ${minDmg} applies)`);
    }

    // 2. APPLY MODE BONUSES
    switch (modeKey) {
        case "burst":
            mods.damage += 2;
            notes.push("Burst (+2 Dmg).");
            flags.rerollSD = true;
            break;
        case "auto":
            mods.damage += 4;
            notes.push("Full Auto (+4 Dmg).");
            flags.rerollAll = true;
            break;
        case "suppressive":
        case "suppress":
            mods.autoSkillSuccesses += 2;
            mods.damage += 4;
            notes.push("Suppressive (+4 Dmg, +2 Auto Hits).");
            flags.rerollAll = true;
            break;
    }

    // 3. APPLY RECOIL
    // Rulebook: "-1 to Success Die for each point of recoil"
    if (recoilPenalty > 0) {
        mods.successDie -= recoilPenalty;
        notes.push(`Recoil -${recoilPenalty} SD.`);
    }

    // 4. CONSUME AMMO
    const actualCost = Math.min(currentAmmo, roundsUsed);
    if (actualCost > 0) {
        await item.update({ "system.ammo": currentAmmo - actualCost });
    }

    // 5. OTHER INPUTS (Cover, Aiming, etc.)
    mods.successDie += (Number(form.cover?.value) || 0);
    mods.successDie += (Number(form.dual?.value) || 0);

    if (form.targetMoved?.checked) mods.successDie -= 1;
    if (form.blind?.checked) mods.allDice -= 1;
    if (form.prone?.checked) mods.successDie += 1;

    if (form.longRange?.checked && game.settings.get("sla-industries", "enableLongRangeFeature")) {
        // Rulebook: "-1 Skill Die" (reducing rank by 1 reduces skill dice by 1)
        mods.rank -= 1;
        notes.push("Long Range (-1 Skill Die).");
    }

    if (modeKey !== "suppressive" && modeKey !== "suppress") {
        const aimVal = form.aiming?.value;
        if (aimVal === "sd") mods.successDie += 1;
        if (aimVal === "skill") mods.autoSkillSuccesses += 1;
    }

    return true;
}

/**
 * Calculates range penalty for ranged attacks.
 * @param {Token} token - The attacker's token.
 * @param {Token} target - The target token.
 * @param {number} maxRange - Maximum weapon range.
 * @returns {Object} { isLongRange, penaltyMsg }
 */
export function calculateRangePenalty(token, target, maxRange) {
    if (!token || !target) {
        return { isLongRange: false, penaltyMsg: "" };
    }

    const dist = canvas.grid.measurePath([token, target]).distance;
    const isLongRange = dist > (maxRange / 2);
    
    return {
        isLongRange,
        penaltyMsg: isLongRange ? "Long Range (-1 Skill Die)" : ""
    };
}

