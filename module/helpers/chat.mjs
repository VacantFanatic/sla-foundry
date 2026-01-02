import { LuckDialog } from "../apps/luck-dialog.mjs";
import { calculateRollResult } from "./dice.mjs";

export class SLAChat {

    static init() {
        // FIX: Remove existing listeners before adding new ones
        $(document.body).off("click", ".chat-btn-wound, .chat-btn-damage, .damage-roll");
        $(document.body).off("click", ".apply-damage-btn");
        $(document.body).off("click", ".roll-toggle");
        $(document.body).off("click", ".chat-btn-luck");
        $(document.body).off("click", ".diff-btn");

        // Register Listeners
        $(document.body).on("click", ".chat-btn-wound, .chat-btn-damage, .damage-roll", this._onRollDamage.bind(this));
        $(document.body).on("click", ".apply-damage-btn", this._onApplyDamage.bind(this));
        $(document.body).on("click", ".roll-toggle", this._onToggleRoll.bind(this));
        $(document.body).on("click", ".chat-btn-luck", this._onLuck.bind(this));
        $(document.body).on("click", ".diff-btn", this._onChangeDifficulty.bind(this));
    }

    /**
     * PART 1: ROLL DAMAGE (Standard Button & Tactical Choices)
     */
    static async _onRollDamage(ev) {
        ev.preventDefault();
        const btn = $(ev.currentTarget);
        const card = btn.closest(".sla-chat-card");

        try {
            // Determine Action Type
            const action = btn.data("action") || "standard";

            // 1. Get Actor
            const uuid = card.data("actor-uuid");
            const actorId = card.data("actor-id");
            let actor = uuid ? await fromUuid(uuid) : game.actors.get(actorId);

            if (!actor) return ui.notifications.error("SLA | Actor not found.");
            if (!actor.isOwner) return ui.notifications.warn("You do not own this actor.");

        // 2. Data Setup
        let rollFormula = "";
        let flavorText = "";
        let adValue = Number(btn.data("ad") || 0);

        // Disable button to prevent double clicks
        btn.prop("disabled", true);

        // --- BRANCH A: TACTICAL CHOICE (MOS 2/3) ---
        if (action === "damage" || action === "wound") {
            const baseFormula = String(btn.data("base-formula") || "0");
            const bonus = Number(btn.data("damage-bonus") || 0);

            // DAMAGE CHOICE
            if (action === "damage") {
                flavorText = `<span style="color:#39ff14">Tactical Choice: +${bonus} Damage</span>`;
                rollFormula = `${baseFormula} + ${bonus}`;
            }
            // WOUND CHOICE
            else if (action === "wound") {
                const location = btn.data("location");
                let woundSuccess = false;

                // Get target from parent message (wound is applied to the TARGET, not the attacker)
                const messageId = card.closest(".message").data("messageId");
                const parentMessage = game.messages.get(messageId);
                const parentTargets = parentMessage?.flags?.sla?.targets || [];
                
                // Apply wound to the first target
                if (parentTargets.length > 0) {
                    const targetToken = await fromUuid(parentTargets[0]);
                    const targetActor = targetToken?.actor;
                    
                    if (targetActor) {
                        const wounds = targetActor.system.wounds;
                        if (location === "arm") {
                            if (!wounds.lArm) { 
                                await targetActor.update({ "system.wounds.lArm": true }); 
                                woundSuccess = true; 
                                flavorText = `<span style="color:#ff4444">Snapped ${targetActor.name}'s Left Arm!</span>`; 
                            }
                            else if (!wounds.rArm) { 
                                await targetActor.update({ "system.wounds.rArm": true }); 
                                woundSuccess = true; 
                                flavorText = `<span style="color:#ff4444">Snapped ${targetActor.name}'s Right Arm!</span>`; 
                            }
                        } else if (location === "leg") {
                            if (!wounds.lLeg) { 
                                await targetActor.update({ "system.wounds.lLeg": true }); 
                                woundSuccess = true; 
                                flavorText = `<span style="color:#ff4444">Broken ${targetActor.name}'s Left Leg!</span>`; 
                            }
                            else if (!wounds.rLeg) { 
                                await targetActor.update({ "system.wounds.rLeg": true }); 
                                woundSuccess = true; 
                                flavorText = `<span style="color:#ff4444">Broken ${targetActor.name}'s Right Leg!</span>`; 
                            }
                        }
                    }
                }

                if (woundSuccess) {
                    // Success: Roll Base Only
                    rollFormula = baseFormula;
                } else {
                    // Failure: Fallback to Damage
                    flavorText = `<span style="color:orange">Limbs Gone! Reverting to +${bonus} Dmg.</span>`;
                    rollFormula = `${baseFormula} + ${bonus}`;
                }
            }
        }

        // --- BRANCH B: STANDARD ROLL (Normal Hit) ---
        else {
            rollFormula = String(btn.data("formula") || "0");
            flavorText = "Standard Damage Roll";
        }

        // 3. EXECUTE ROLL & RENDER CARD
        console.log("SLA | Rolling Damage:", rollFormula);
        let roll = new Roll(rollFormula);
        await roll.evaluate();

        // CHECK MIN DAMAGE AND PREVENT NEGATIVE DAMAGE
        // If min damage is not populated, assume it's 0
        // Handle both string and number formats - use attr() for reliable reading
        const minDmgRaw = btn.attr("data-min") || btn.data("min") || "0";
        const minDmg = Math.max(0, Number(minDmgRaw) || 0);
        let finalTotal = Math.max(0, roll.total); // Never allow negative damage

        console.log(`SLA | Damage Roll - Raw: ${roll.total}, Min Damage (raw: "${minDmgRaw}", parsed: ${minDmg}), Final Before Check: ${finalTotal}`);

        // Always enforce minimum damage (even if it's 0)
        if (finalTotal < minDmg) {
            console.log(`SLA | Min Damage Triggered: ${finalTotal} -> ${minDmg}`);
            finalTotal = minDmg;
            if (minDmg > 0) {
                flavorText += `<br/><span style="color:orange; font-size:0.9em;">(Raised to Min Damage ${minDmg})</span>`;
            }

            // Critical: Force the text property of the roll instance
            // The Roll instance is immutable-ish, but for display and apply buttons data, we need this.
            if (roll._total !== undefined) roll._total = minDmg;
        } else {
            console.log(`SLA | Min Damage Check: ${finalTotal} >= ${minDmg} (No Change)`);
        }
        
        console.log(`SLA | Final Damage Total: ${finalTotal}`);

        const templateData = {
            damageTotal: finalTotal,
            adValue: adValue,
            flavor: flavorText
        };

        const content = await foundry.applications.handlebars.renderTemplate("systems/sla-industries/templates/chat/chat-damage.hbs", templateData);

        // Get targets from parent message flags
        const messageId = card.closest(".message").data("messageId");
        const parentMessage = game.messages.get(messageId);
        const parentTargets = parentMessage?.flags?.sla?.targets || [];

        const damageMessage = await roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: actor }),
            content: content,
            flags: {
                sla: {
                    targets: parentTargets,
                    autoApply: action === "wound" // Flag for auto-apply
                }
            }
        });

        // AUTO-APPLY DAMAGE FOR WOUND CHOICES
        if (action === "wound" && parentTargets.length > 0) {
            // Wait a moment for the message to render
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Get the first target (primary target)
            const targetUuid = parentTargets[0];
            if (targetUuid) {
                // Automatically apply damage to the target
                await this._applyDamageToTarget(finalTotal, adValue, targetUuid);
            }
        }
        } catch (err) {
            console.error("SLA | Error in _onRollDamage:", err);
            ui.notifications.error("SLA | Failed to roll damage. See console for details.");
            btn.prop("disabled", false); // Re-enable button on error
        }
    }

    /**
     * Helper: Apply damage directly to a target (used for auto-apply on wound choices)
     */
    static async _applyDamageToTarget(rawDamage, ad, targetUuid) {
        // Find the target token/actor
        const token = await fromUuid(targetUuid);
        const victim = token?.actor;
        
        if (!victim) {
            console.warn("SLA | Auto-apply: Target not found", targetUuid);
            return;
        }

        // 3. ARMOR LOGIC (Find Equipped Armor)
        const armorItem = victim.items.find(i => i.type === "armor" && i.system.equipped);

        let targetPV = 0;
        let armorData = null;

        // A. Determine PV (Protection Value)
        if (armorItem) {
            targetPV = armorItem.system.pv || 0;
        } else if (victim.system.armor?.pv) {
            // Natural Armor Fallback (NPCs)
            targetPV = victim.system.armor.pv || 0;
        }

        // B. Apply AD (Armor Degradation) Logic
        let effectivePV = targetPV;

        if (armorItem && ad > 0) {
            const currentRes = armorItem.system.resistance?.value || 0;
            const maxRes = armorItem.system.resistance?.max || 10;

            // 1. Reduce Resistance
            const newRes = Math.max(0, currentRes - ad);

            // 2. Update the Item
            await armorItem.update({ "system.resistance.value": newRes });

            // 3. Calculate Effective PV based on NEW Resistance state
            if (newRes <= 0) {
                effectivePV = 0; // Armor Destroyed
            } else if (newRes < (maxRes / 2)) {
                effectivePV = Math.floor(targetPV / 2); // Armor Compromised
            } else {
                effectivePV = targetPV; // Armor Intact
            }

            // Prepare Data for Template
            armorData = {
                current: currentRes,
                new: newRes,
                ad: ad,
                effectivePV: effectivePV
            };
        }

        // 4. DAMAGE CALCULATION (Dmg - Effective PV)
        let finalDamage = Math.max(0, rawDamage - effectivePV);

        // 5. APPLY TO HP
        let currentHP = victim.system.hp.value;
        let newHP = currentHP - finalDamage;

        await victim.update({ "system.hp.value": newHP });

        // 6. CHAT REPORT
        const templateData = {
            victimName: victim.name,
            rawDamage: rawDamage,
            targetPV: targetPV,
            finalDamage: finalDamage,
            hpData: {
                old: currentHP,
                new: newHP
            },
            armorData: armorData
        };

        const content = await foundry.applications.handlebars.renderTemplate("systems/sla-industries/templates/chat/chat-damage-result.hbs", templateData);

        ChatMessage.create({
            content: content
        });
    }

    /**
     * PART 2: APPLY DAMAGE (Reduces HP & Armor)
     */
    static async _onApplyDamage(ev) {
        ev.preventDefault();
        const btn = $(ev.currentTarget);

        try {
            // 1. Get Data from Button
            const rawDamage = Number(btn.data("dmg"));
            const ad = Number(btn.data("ad"));
            const type = btn.data("target");
            const targetUuid = btn.data("target-uuid");

            // 2. Find Victim
            let victim = null;

            // A. Specific Target (from GM button)
            if (targetUuid) {
                const token = await fromUuid(targetUuid);
                victim = token?.actor;
            }
        // B. Selected Token (Apply to Selected)
        else if (type === "selected") {
            victim = canvas.tokens.controlled[0]?.actor;
            if (!victim) return ui.notifications.warn("No token selected.");
        }
        // C. GM's Current Target (Fallback)
        else {
            victim = game.user.targets.first()?.actor;
            if (!victim) return ui.notifications.warn("No target designated.");
        }

        // 3. ARMOR LOGIC (Find Equipped Armor)
        const armorItem = victim.items.find(i => i.type === "armor" && i.system.equipped);

        let targetPV = 0;
        let armorData = null; // Replaces 'armorUpdateMsg' string

        // A. Determine PV (Protection Value)
        if (armorItem) {
            targetPV = armorItem.system.pv || 0;
        } else if (victim.system.armor?.pv) {
            // Natural Armor Fallback (NPCs)
            targetPV = victim.system.armor.pv || 0;
        }

        // B. Apply AD (Armor Degradation) Logic
        let effectivePV = targetPV;

        if (armorItem && ad > 0) {
            const currentRes = armorItem.system.resistance?.value || 0;
            const maxRes = armorItem.system.resistance?.max || 10;

            // 1. Reduce Resistance
            const newRes = Math.max(0, currentRes - ad);

            // 2. Update the Item
            await armorItem.update({ "system.resistance.value": newRes });

            // 3. Calculate Effective PV based on NEW Resistance state
            if (newRes <= 0) {
                effectivePV = 0; // Armor Destroyed
            } else if (newRes < (maxRes / 2)) {
                effectivePV = Math.floor(targetPV / 2); // Armor Compromised
            } else {
                effectivePV = targetPV; // Armor Intact
            }

            // Prepare Data for Template
            armorData = {
                current: currentRes,
                new: newRes,
                ad: ad,
                effectivePV: effectivePV
            };
        }

        // 4. DAMAGE CALCULATION (Dmg - Effective PV)
        let finalDamage = Math.max(0, rawDamage - effectivePV);

        // 5. APPLY TO HP
        let currentHP = victim.system.hp.value;
        let newHP = currentHP - finalDamage;

        await victim.update({ "system.hp.value": newHP });

        // 6. CHAT REPORT (Moved to Partial)
        const templateData = {
            victimName: victim.name,
            rawDamage: rawDamage,
            targetPV: targetPV,
            finalDamage: finalDamage,
            hpData: {
                old: currentHP,
                new: newHP
            },
            armorData: armorData
        };

        const content = await foundry.applications.handlebars.renderTemplate("systems/sla-industries/templates/chat/chat-damage-result.hbs", templateData);

        ChatMessage.create({
            content: content
        });
        } catch (err) {
            console.error("SLA | Error in _onApplyDamage:", err);
            ui.notifications.error("SLA | Failed to apply damage. See console for details.");
        }
    }

    /**
     * PART 3: TOGGLE ROLL TOOLTIP
     */
    static _onToggleRoll(ev) {
        ev.preventDefault();
        const btn = $(ev.currentTarget);
        const card = btn.closest(".sla-chat-card");
        const tooltip = card.find(".dice-tooltip");

        if (tooltip.length) {
            tooltip.slideToggle(200);
        }
    }

    /**
     * PART 4: LUCK USE
     */
    static async _onLuck(ev) {
        ev.preventDefault();
        const btn = $(ev.currentTarget);
        const card = btn.closest(".sla-chat-card");

        // 1. Get Actor
        const uuid = card.data("actor-uuid");
        const actorId = card.data("actor-id");
        let actor = uuid ? await fromUuid(uuid) : game.actors.get(actorId);

        if (!actor) return ui.notifications.error("SLA | Actor not found.");
        if (!actor.isOwner) return ui.notifications.warn("You do not own this actor.");

        // 2. Get Message
        const messageId = card.closest(".message").data("messageId");
        const message = game.messages.get(messageId);
        if (!message) return;

        // 3. Get Roll
        const roll = message.rolls[0];
        if (!roll) return ui.notifications.warn("No roll data found.");

        // 4. Open Dialog
        LuckDialog.create(actor, roll, messageId);
    }
    // ... (Luck Method above) ...

    // ... (Luck Method above) ...

    /**
     * PART 5: CHANGE DIFFICULTY (TN)
     */
    static async _onChangeDifficulty(ev) {
        ev.preventDefault();
        const btn = $(ev.currentTarget);
        if (!game.user.isGM) return ui.notifications.warn("Only GM can adjust difficulty.");

        try {
            const card = btn.closest(".sla-chat-card");
            const newTN = Number(btn.data("tn"));

            // Retrieve Data
            const messageId = card.closest(".message").data("messageId");
            const message = game.messages.get(messageId);
            if (!message) return;

            const flags = message.flags.sla || {};
            const roll = message.rolls[0];
            if (!roll) return;

        // Preserve Min Damage from existing card if possible
        const minDamage = Number(card.find(".damage-roll").data("min")) || 0;

        // Re-Calculate Result
        const result = calculateRollResult(roll, flags.baseModifier, newTN, {
            autoSkillSuccesses: flags.autoSkillSuccesses || 0
        });

        // Re-Generate Display Data (Minimal reconstruction)
        // Note: This logic duplicates some of actor-sheet.mjs. 
        // Ideally should be shared, but inline here for now.

        const isSuccess = result.isSuccess;
        const skillSuccessCount = result.skillHits + (flags.autoSkillSuccesses || 0);

        // MOS Logic
        let mosDamageBonus = 0;
        let mosEffectText = isSuccess ? "Standard Hit" : "Failed";
        let mosChoiceData = { hasChoice: false, choiceType: "", choiceDmg: 0 };

        // Match Ebb Flags
        if (flags.isEbb) {
            // Ebb uses 'skillSuccessCount' (which is skillHits + auto)
            // But Ebb logic in sheet was: skillSuccesses = hits.
            // And Base Success = isSuccess.

            // Recalculation Effect Text
            if (isSuccess) {
                if (skillSuccessCount === 2) { mosDamageBonus = 1; mosEffectText = "+1 Damage / Effect"; }
                else if (skillSuccessCount === 3) { mosDamageBonus = 2; mosEffectText = "+2 Damage / Repeat Ability"; }
                else if (skillSuccessCount >= 4) { mosDamageBonus = 4; mosEffectText = "<strong style='color:#39ff14'>CRITICAL:</strong> +4 Dmg | Regain 1 FLUX"; }
            }
        }

        // --- WEAPON MOS LOGIC (Original) ---
        else if (flags.isWeapon) {
            if (isSuccess && !result.successThroughExperience) {
                if (skillSuccessCount === 1) { mosDamageBonus = 1; mosEffectText = "+1 Damage"; }
                else if (skillSuccessCount === 2) { mosEffectText = "MOS 2: Choose Effect"; mosChoiceData = { hasChoice: true, choiceType: "arm", choiceDmg: 2 }; }
                else if (skillSuccessCount === 3) { mosEffectText = "MOS 3: Choose Effect"; mosChoiceData = { hasChoice: true, choiceType: "leg", choiceDmg: 4 }; }
                else if (skillSuccessCount >= 4) { 
                    mosDamageBonus = 6; 
                    mosEffectText = "<strong style='color:#ff5555'>HEAD SHOT</strong> (+6 DMG)";
                    
                    // AUTO-APPLY HEAD WOUND ON HEAD SHOT (when recalculated)
                    const targets = flags.targets || [];
                    if (targets.length > 0) {
                        const targetToken = await fromUuid(targets[0]);
                        const targetActor = targetToken?.actor;
                        if (targetActor && !targetActor.system.wounds.head) {
                            await targetActor.update({ "system.wounds.head": true });
                        }
                    }
                }
            } else if (result.successThroughExperience) {
                mosEffectText = "Success Through Experience";
            }
        }

        // --- SKILL / OTHER ---
        else {
            if (isSuccess) mosEffectText = `Margin of Success: ${skillSuccessCount}`;
        }

        // Damage Formula Reconstruction
        let baseDmg = flags.damageBase || "0";
        let damageMod = flags.damageMod || 0;
        let totalMod = damageMod + mosDamageBonus;

        // If damageBase is 0 and we have mod, use mod. If base > 0, append.
        let finalDmgFormula = baseDmg;
        if (totalMod !== 0) {
            if (baseDmg === "0" || baseDmg === "") finalDmgFormula = String(totalMod);
            else finalDmgFormula = `${baseDmg} ${totalMod > 0 ? "+" : ""} ${totalMod}`;
        }

        let showButton = isSuccess && (finalDmgFormula && finalDmgFormula !== "0");
        const resultColor = isSuccess ? '#39ff14' : '#f55';

        // Render Method
        // We reuse the existing flags for adValue, itemName, etc.
        // Get original TN from flags or default to 10
        const originalTN = flags.tn || 10;
        let baseNotes = flags.notes || "";
        // Strip any existing TN notes from baseNotes to prevent accumulation
        // Pattern matches: " (TN X)" or " (TN X → Y)" (matches anywhere, but typically at end)
        baseNotes = baseNotes.replace(/\s*\(TN\s+\d+(?:\s*→\s*\d+)?\)/g, "").trim();
        // Append TN change note if TN changed
        const tnNote = (newTN !== originalTN) ? ` (TN ${originalTN} → ${newTN})` : ` (TN ${newTN})`;
        // tnNote already starts with a space, so append it to baseNotes
        const finalNotes = baseNotes + tnNote;
        
        const templateData = {
            actorUuid: card.data("actor-uuid"),
            borderColor: resultColor,
            headerColor: resultColor,
            resultColor: resultColor,
            itemName: flags.itemName,
            successTotal: result.total,
            tooltip: await roll.getTooltip(), // Use standard tooltip or regenerate? Standard is fine.
            skillDice: result.skillDiceData,
            notes: finalNotes, // Use notes from flags instead of DOM parsing

            showDamageButton: showButton,
            dmgFormula: finalDmgFormula,
            minDamage: minDamage,
            adValue: flags.adValue || 0,
            sdIsReroll: flags.rofRerollSD,

            mos: {
                isSuccess: isSuccess,
                hits: skillSuccessCount,
                effect: mosEffectText,
                ...mosChoiceData
            },

            canUseLuck: (card.find(".chat-btn-luck").length > 0), // Basic check if luck button was there
            luckValue: 0, // Visual only, doesn't matter much if we don't know exact value. 
            // Or we could re-fetch actor?
            luckSpent: false
        };

        // Refetch actor for Luck Value?
        const actor = await fromUuid(templateData.actorUuid);
        if (actor) {
            templateData.luckValue = actor.system.stats.luck.value;
        }

        const chatContent = await foundry.applications.handlebars.renderTemplate("systems/sla-industries/templates/chat/chat-weapon-rolls.hbs", templateData);

        await message.update({
            content: chatContent,
            "flags.sla.tn": newTN,
            "flags.sla.notes": finalNotes // Update notes in flags to preserve them
        });
        } catch (err) {
            console.error("SLA | Error in _onChangeDifficulty:", err);
            ui.notifications.error("SLA | Failed to change difficulty. See console for details.");
        }
    }

    /**
     * PART 6: RENDER HOOK (Manage Button Visibility)
     */
    static async onRenderChatMessage(message, html, data) {
        // V13 Migration: 'html' can be HTMLElement or jQuery object
        const htmlElement = html instanceof HTMLElement ? html : html[0];
        const $html = $(htmlElement);

        const dmgButtons = $html.find(".apply-damage-btn");
        if (!dmgButtons.length) return;

        // 1. Hide for Non-GMs
        if (!game.user.isGM) {
            dmgButtons.remove();
            return;
        }

        // 2. Dynamic Target Button for GM
        const targets = message.flags?.sla?.targets || [];
        if (targets.length > 0) {
            try {
                const targetUuid = targets[0]; // Take first target
                const tokenDocument = await fromUuid(targetUuid);

                if (tokenDocument) {
                    const targetBtn = $html.find('.apply-damage-btn[data-target="target"]');
                    targetBtn.html(`<i class="fas fa-crosshairs"></i> Apply to ${tokenDocument.name}`);
                    targetBtn.attr("data-target-uuid", targetUuid);
                }
            } catch (err) {
                console.error("SLA | Error in onRenderChatMessage (target button):", err);
                // Non-critical error, don't show notification
            }
        }
    }
}
