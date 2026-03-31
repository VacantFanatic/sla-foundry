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
    static async _resolveActorFromUuid(targetUuid) {
        const token = await fromUuid(targetUuid);
        return token?.actor ?? null;
    }

    static async _resolveVictimForApplyDamage({ targetUuid, type }) {
        if (targetUuid) {
            return await this._resolveActorFromUuid(targetUuid);
        }

        if (type === "selected") {
            const selectedActor = canvas.tokens.controlled[0]?.actor;
            if (!selectedActor) {
                ui.notifications.warn("No token selected.");
                return null;
            }
            return selectedActor;
        }

        const targetActor = game.user.targets.first()?.actor;
        if (!targetActor) {
            ui.notifications.warn("No target designated.");
            return null;
        }
        return targetActor;
    }

    static async _computeArmorMitigation(victim, ad) {
        const armorItem = victim.items.find(i => i.type === "armor" && i.system.equipped);

        let targetPV = 0;
        let armorData = null;

        if (armorItem) {
            targetPV = armorItem.system.pv || 0;
        } else if (victim.system.armor?.pv) {
            targetPV = victim.system.armor.pv || 0;
        }

        let effectivePV = targetPV;
        if (armorItem && ad > 0) {
            const currentRes = armorItem.system.resistance?.value || 0;
            const maxRes = armorItem.system.resistance?.max || 10;
            const newRes = Math.max(0, currentRes - ad);
            await armorItem.update({ "system.resistance.value": newRes });

            if (newRes <= 0) effectivePV = 0;
            else if (newRes < (maxRes / 2)) effectivePV = Math.floor(targetPV / 2);
            else effectivePV = targetPV;

            armorData = {
                current: currentRes,
                new: newRes,
                ad: ad,
                effectivePV: effectivePV
            };
        }

        return { targetPV, effectivePV, armorData };
    }

    static async _applyHpDamage(victim, rawDamage, effectivePV) {
        const finalDamage = Math.max(0, rawDamage - effectivePV);
        const currentHP = victim.system.hp.value;
        const newHP = currentHP - finalDamage;
        await victim.update({ "system.hp.value": newHP });

        return {
            finalDamage,
            hpData: {
                old: currentHP,
                new: newHP
            }
        };
    }

    static async _postDamageResultChat({ victim, rawDamage, targetPV, finalDamage, hpData, armorData }) {
        const templateData = {
            victimName: victim.name,
            rawDamage: rawDamage,
            targetPV: targetPV,
            finalDamage: finalDamage,
            hpData: hpData,
            armorData: armorData
        };

        const content = await foundry.applications.handlebars.renderTemplate(
            "systems/sla-industries/templates/chat/chat-damage-result.hbs",
            templateData
        );

        ChatMessage.create({ content });
    }

    static async _applyDamageToVictim(victim, rawDamage, ad) {
        const { targetPV, effectivePV, armorData } = await this._computeArmorMitigation(victim, ad);
        const { finalDamage, hpData } = await this._applyHpDamage(victim, rawDamage, effectivePV);
        await this._postDamageResultChat({
            victim,
            rawDamage,
            targetPV,
            finalDamage,
            hpData,
            armorData
        });
    }

    static async _applyDamageToTarget(rawDamage, ad, targetUuid) {
        const victim = await this._resolveActorFromUuid(targetUuid);
        if (!victim) {
            console.warn("SLA | Auto-apply: Target not found", targetUuid);
            return;
        }
        await this._applyDamageToVictim(victim, rawDamage, ad);
    }

    /**
     * PART 2: APPLY DAMAGE (Reduces HP & Armor)
     */
    static async _onApplyDamage(ev) {
        ev.preventDefault();
        const btn = $(ev.currentTarget);

        try {
            const rawDamage = Number(btn.data("dmg"));
            const ad = Number(btn.data("ad"));
            const type = btn.data("target");
            const targetUuid = btn.data("target-uuid");
            const victim = await this._resolveVictimForApplyDamage({ targetUuid, type });
            if (!victim) return;
            await this._applyDamageToVictim(victim, rawDamage, ad);
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

        // 3. Check if luck has already been spent
        const flags = message.flags.sla || {};
        if (flags.luckSpent) {
            return ui.notifications.warn("SLA | Luck has already been spent on this roll. Only one option may be applied per roll.");
        }

        // 4. Get Roll
        const roll = message.rolls[0];
        if (!roll) return ui.notifications.warn("No roll data found.");

        // 5. Open Dialog
        LuckDialog.create(actor, roll, messageId);
    }

    static async _applyHeadshotForDifficultyRecalc(flags) {
        const targets = flags.targets || [];
        if (targets.length === 0) return;

        const targetToken = await fromUuid(targets[0]);
        const targetActor = targetToken?.actor;
        if (targetActor && !targetActor.system.wounds.head) {
            await targetActor.update({ "system.wounds.head": true });
        }
    }

    static async _resolveDifficultyRecalcMos(flags, result, isSuccess, skillSuccessCount) {
        let mosDamageBonus = 0;
        let mosEffectText = isSuccess ? "Standard Hit" : "Failed";
        let mosChoiceData = { hasChoice: false, choiceType: "", choiceDmg: 0 };

        if (flags.isEbb) {
            if (isSuccess) {
                if (skillSuccessCount === 2) { mosDamageBonus = 1; mosEffectText = "+1 Damage / Effect"; }
                else if (skillSuccessCount === 3) { mosDamageBonus = 2; mosEffectText = "+2 Damage / Repeat Ability"; }
                else if (skillSuccessCount >= 4) { mosDamageBonus = 4; mosEffectText = "<strong style='color:#39ff14'>CRITICAL:</strong> +4 Dmg | Regain 1 FLUX"; }
            }
            return { mosDamageBonus, mosEffectText, mosChoiceData };
        }

        if (flags.isWeapon) {
            if (isSuccess && !result.successThroughExperience) {
                if (skillSuccessCount === 1) { mosDamageBonus = 1; mosEffectText = "+1 Damage"; }
                else if (skillSuccessCount === 2) { mosEffectText = "MOS 2: Choose Effect"; mosChoiceData = { hasChoice: true, choiceType: "arm", choiceDmg: 2 }; }
                else if (skillSuccessCount === 3) { mosEffectText = "MOS 3: Choose Effect"; mosChoiceData = { hasChoice: true, choiceType: "leg", choiceDmg: 4 }; }
                else if (skillSuccessCount >= 4) {
                    mosDamageBonus = 6;
                    mosEffectText = "<strong style='color:#ff5555'>HEAD SHOT</strong> (+6 DMG)";
                    await this._applyHeadshotForDifficultyRecalc(flags);
                }
            } else if (result.successThroughExperience) {
                mosEffectText = "Success Through Experience";
            }
            return { mosDamageBonus, mosEffectText, mosChoiceData };
        }

        if (isSuccess) mosEffectText = `Margin of Success: ${skillSuccessCount}`;
        return { mosDamageBonus, mosEffectText, mosChoiceData };
    }

    static _rebuildDifficultyDamageFormula(flags, mosDamageBonus) {
        const baseDmg = flags.damageBase || "0";
        const damageMod = flags.damageMod || 0;
        const totalMod = damageMod + mosDamageBonus;

        let finalDmgFormula = baseDmg;
        if (totalMod !== 0) {
            if (baseDmg === "0" || baseDmg === "") finalDmgFormula = String(totalMod);
            else finalDmgFormula = `${baseDmg} ${totalMod > 0 ? "+" : ""} ${totalMod}`;
        }
        return finalDmgFormula;
    }

    static _buildDifficultyNotes(flags, newTN) {
        const originalTN = flags.tn || 10;
        let baseNotes = flags.notes || "";
        baseNotes = baseNotes.replace(/\s*\(TN\s+\d+(?:\s*→\s*\d+)?\)/g, "").trim();
        const tnNote = (newTN !== originalTN) ? ` (TN ${originalTN} → ${newTN})` : ` (TN ${newTN})`;
        return baseNotes + tnNote;
    }

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

        const minDamage = Number(card.find(".damage-roll").data("min")) || 0;
        const result = calculateRollResult(roll, flags.baseModifier, newTN, {
            autoSkillSuccesses: flags.autoSkillSuccesses || 0
        });
        const isSuccess = result.isSuccess;
        const skillSuccessCount = result.skillHits + (flags.autoSkillSuccesses || 0);
        const { mosDamageBonus, mosEffectText, mosChoiceData } = await this._resolveDifficultyRecalcMos(
            flags,
            result,
            isSuccess,
            skillSuccessCount
        );
        const finalDmgFormula = this._rebuildDifficultyDamageFormula(flags, mosDamageBonus);

        let showButton = isSuccess && (finalDmgFormula && finalDmgFormula !== "0");
        const resultColor = isSuccess ? '#39ff14' : '#f55';
        const finalNotes = this._buildDifficultyNotes(flags, newTN);
        
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
            luckSpent: flags.luckSpent || false // Read from flags to preserve state
        };

        // Refetch actor for Luck Value and canUseLuck
        const actor = await fromUuid(templateData.actorUuid);
        if (actor) {
            templateData.luckValue = actor.system.stats.luck.value;
            templateData.canUseLuck = actor.system.stats.luck.value > 0;
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
