import { LuckDialog } from "../apps/luck-dialog.mjs";

export class SLAChat {

    static init() {
        // FIX: Remove existing listeners before adding new ones
        $(document.body).off("click", ".chat-btn-wound, .chat-btn-damage, .damage-roll");
        $(document.body).off("click", ".apply-damage-btn");
        $(document.body).off("click", ".roll-toggle");
        $(document.body).off("click", ".chat-btn-luck");

        // Register Listeners
        $(document.body).on("click", ".chat-btn-wound, .chat-btn-damage, .damage-roll", this._onRollDamage.bind(this));
        $(document.body).on("click", ".apply-damage-btn", this._onApplyDamage.bind(this));
        $(document.body).on("click", ".roll-toggle", this._onToggleRoll.bind(this));
        $(document.body).on("click", ".chat-btn-luck", this._onLuck.bind(this));
    }

    /**
     * PART 1: ROLL DAMAGE (Standard Button & Tactical Choices)
     */
    static async _onRollDamage(ev) {
        ev.preventDefault();
        const btn = $(ev.currentTarget);
        const card = btn.closest(".sla-chat-card");

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

                // Update Wounds Logic
                const wounds = actor.system.wounds;
                if (location === "arm") {
                    if (!wounds.larm) { await actor.update({ "system.wounds.larm": true }); woundSuccess = true; flavorText = `<span style="color:#ff4444">Snapped Left Arm!</span>`; }
                    else if (!wounds.rarm) { await actor.update({ "system.wounds.rarm": true }); woundSuccess = true; flavorText = `<span style="color:#ff4444">Snapped Right Arm!</span>`; }
                } else if (location === "leg") {
                    if (!wounds.lleg) { await actor.update({ "system.wounds.lleg": true }); woundSuccess = true; flavorText = `<span style="color:#ff4444">Broken Left Leg!</span>`; }
                    else if (!wounds.rleg) { await actor.update({ "system.wounds.rleg": true }); woundSuccess = true; flavorText = `<span style="color:#ff4444">Broken Right Leg!</span>`; }
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

        // CHECK MIN DAMAGE
        const minDmg = Number(btn.data("min")) || 0;
        let finalTotal = roll.total;

        if (minDmg > 0 && finalTotal < minDmg) {
            console.log(`SLA | Min Damage Triggered: ${finalTotal} -> ${minDmg}`);
            finalTotal = minDmg;
            flavorText += `<br/><span style="color:orange; font-size:0.9em;">(Raised to Min Damage ${minDmg})</span>`;

            // Critical: Force the text property of the roll instance
            // The Roll instance is immutable-ish, but for display and apply buttons data, we need this.
            if (roll._total !== undefined) roll._total = minDmg;
        } else {
            console.log(`SLA | Min Damage Check: ${finalTotal} >= ${minDmg} (No Change)`);
        }

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

        roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: actor }),
            content: content,
            flags: {
                sla: {
                    targets: parentTargets
                }
            }
        });
    }

    /**
     * PART 2: APPLY DAMAGE (Reduces HP & Armor)
     */
    static async _onApplyDamage(ev) {
        ev.preventDefault();
        const btn = $(ev.currentTarget);

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

    /**
     * PART 5: RENDER HOOK (Manage Button Visibility)
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
            const targetUuid = targets[0]; // Take first target
            const tokenDocument = await fromUuid(targetUuid);

            if (tokenDocument) {
                const targetBtn = $html.find('.apply-damage-btn[data-target="target"]');
                targetBtn.html(`<i class="fas fa-crosshairs"></i> Apply to ${tokenDocument.name}`);
                targetBtn.attr("data-target-uuid", targetUuid);
            }
        }
    }
}
