/**
 * Dialog for spending Luck points.
 */
export class LuckDialog extends Dialog {

    constructor(actor, roll, messageId, data, options) {
        super(data, options);
        this.actor = actor;
        this.roll = roll;
        this.messageId = messageId;
    }

    /**
     * Factory method to create and render the dialog.
     */
    static async create(actor, roll, messageId) {
        // Extract Skill Dice from the roll
        // Assumption: Term 0 is Success Die (1d10), Term 1 is Operator, Term 2 is Skill Dice (Nd10)
        // Adjust this index based on your actual roll structure!
        let skillDice = [];
        if (roll.terms.length > 2 && roll.terms[2].results) {
            const baseMod = (roll.total - roll.result); // Rough approximation, better to pass explicit mod if possible
            // Actually, let's grab the stored dice from the chat message logic if we can,
            // but here we only have the Roll object. 
            // We will trust the visual values from the terms.

            // To be precise we need the base modifier to show the 'Total' (Die + Mod). 
            // Looking at actor-sheet.mjs:
            // sdTotal = sdRaw + baseModifier
            // So Total - Sum(Dice) = BaseModifier? Not quite if dice are separate.
            // Let's rely on the raw results for identification, validity is verified by the roll.

            skillDice = roll.terms[2].results.map(r => ({
                result: r.result,
                total: r.result, // We might not know the mod here easily without recalculating
                borderColor: r.success ? "#39ff14" : "#555" // We don't have success state here without TN
            }));
        }



        // --- CHECK ROF RESTRICTIONS ---
        const message = game.messages.get(messageId);
        const flags = message.flags.sla || {};
        const rofRerollSD = flags.rofRerollSD || false;
        const rofRerollSkills = flags.rofRerollSkills || [];

        // Update Skill Dice with disabled state if rerolled by ROF
        skillDice.forEach((d, i) => {
            if (rofRerollSkills.includes(i)) {
                d.disabled = true;
                d.borderColor = "#555"; // Grey out visually
            }
        });

        const templateData = {
            luck: actor.system.stats.luck,
            skillDice: skillDice,
            rofRerollSD: rofRerollSD
        };

        const content = await renderTemplate("systems/sla-industries/templates/dialogs/luck-dialog.hbs", templateData);

        return new LuckDialog(actor, roll, messageId, {
            title: "Use Luck",
            content: content,
            buttons: {} // No default buttons
        }, { width: 400 }).render(true);
    }

    /** @override */
    activateListeners(html) {
        super.activateListeners(html);

        html.find("button[data-action]").click(this._onAction.bind(this));
    }

    async _onAction(event) {
        event.preventDefault();
        const action = event.currentTarget.dataset.action;
        const html = this.element;

        if (action === "reroll-sd") {
            await this._applyRerollSD();
        } else if (action === "add-mod") {
            const amount = Number(html.find("input[name='modAmount']").val());
            await this._applyModifier(amount);
        } else if (action === "reroll-skill") {
            const checkboxes = html.find("input[name='rerollSelect']:checked");
            const indices = [];
            checkboxes.each((i, el) => indices.push(Number(el.value)));

            if (indices.length === 0) return ui.notifications.warn("Select at least one die to reroll.");
            await this._applyRerollSkill(indices);
        }

        this.close();
    }

    async _deductLuck(cost) {
        const current = this.actor.system.stats.luck.value;
        if (current < cost) {
            ui.notifications.error("Not enough Luck!");
            return false;
        }
        await this.actor.update({ "system.stats.luck.value": current - cost });
        return true;
    }

    async _applyRerollSD() {
        if (!(await this._deductLuck(1))) return;

        // 1. Reroll the first term (Success Die)
        const roll = this.roll;

        // Use Foundry's DiceTerm.reroll method or manually replace
        // Since we want to reroll a specific term:
        const successDie = roll.terms[0];
        // Reroll logic: create a new roll for 1d10 and replace result
        const newRoll = new Roll("1d10");
        await newRoll.evaluate();
        const newResult = newRoll.terms[0].results[0];

        // Replace in original roll
        successDie.results[0] = newResult;

        // Re-evaluate total
        // We need to re-sum everything. 
        // Helper: roll._total = ... but that's private.
        // Better to recreate the roll structure if possible, but mutating works if we are careful.
        this._updateRollTotal(roll);

        await this._updateMessage(roll, "Rerolled Success Die (Luck)");
    }

    async _applyModifier(amount) {
        if (!(await this._deductLuck(amount))) return;

        const roll = this.roll;
        // Modifying the Success Die result? Or adding a bonus term?
        // Rules: "add a +1 modifier to the Success Die"
        // We can just inject a "+ X" term or modify the result.
        // Modifying result is cleaner for "Success Die Total" displays.

        // However, result shouldn't exceed die size usually, but modifiers allow it.
        // Let's add a new operator + number term to end of roll to be safe?
        // But the previous code calculates Success Die total as `sdRaw + baseModifier`.
        // If we change the roll terms, the previous chat card logic might break if it expects specific indices.
        // The chat card logic in `actor-sheet.mjs` was:
        // `sdRaw = roll.terms[0].results[0].result`
        // `sdTotal = sdRaw + baseModifier`

        // We can't easily instruct the Chat Message to change its display logic effectively without re-rendering context.
        // The existing chat logic extracts `sdRaw` from term 0.
        // If we modify term 0's result, it works for the "Raw" part, but we want a modifier.

        // Actually, the simplest way is to modify the stored Roll object's terms[0] result 
        // to be artificially higher? No, that breaks 1-10 range logic if we care about crits checks on natural 10.
        // Current sheet logic: `resultColor = finalTotal > 10 ? ...`

        // Let's append a "+ X" to the roll formula and evaluate?
        // `roll.terms.push(new OperatorTerm({operator: "+"}));`
        // `roll.terms.push(new NumericTerm({number: amount}));`
        // But the sheet logic `sdRaw = roll.terms[0]...` ignores subsequent terms unless they are skill dice (term 2).

        // OPTION B: Modify the `baseModifier` used in the template.
        // But the template is rendered HTML. We need to re-feed data to the template.
        // The roll object is stored in the message.

        // DECISION: We will perform the math update on the roll object (add to total)
        // AND we will have to call the `ActorSheet`'s rendering logic again to get the new HTML.
        // Use `SlaActorSheet.prototype._generateTooltip` or similar? 
        // No, that's instance method. We might need to copy-paste some render logic or make it static/shared.

        // Quickest path: Edit the roll, then re-run the `renderTemplate` call manually here matching the original.

        // For Modifier:
        // We will add a "+ X" term to the roll so the `roll.total` is correct.
        // And we will pass this extra mod to the template so it can display "Luck +X".

        roll.terms.push(new foundry.dice.terms.OperatorTerm({ operator: "+" }));
        roll.terms.push(new foundry.dice.terms.NumericTerm({ number: amount, options: { flavor: "Luck" } }));

        this._updateRollTotal(roll);
        await this._updateMessage(roll, `Added +${amount} to Success Die (Luck)`);
    }

    async _applyRerollSkill(indices) {
        if (!(await this._deductLuck(1))) return;

        const roll = this.roll;

        // Term 2 is Skill Dice usually: 1d10 + Nd10
        // Term 0 = 1d10
        // Term 1 = +
        // Term 2 = Nd10
        const skillDieTerm = roll.terms[2];
        if (!skillDieTerm) return; // Should not happen

        for (const index of indices) {
            if (skillDieTerm.results[index]) {
                const subRoll = new Roll("1d10");
                await subRoll.evaluate();
                skillDieTerm.results[index] = subRoll.terms[0].results[0];
            }
        }

        this._updateRollTotal(roll);
        await this._updateMessage(roll, `Rerolled ${indices.length} Skill Dice (Luck)`);
    }

    _updateRollTotal(roll) {
        // Re-evaluate total safely
        const total = roll.terms.reduce((acc, t) => {
            if (t.total !== undefined && t.total !== null) return acc + t.total;
            // Fallback for simple terms
            // Operator
            if (t instanceof foundry.dice.terms.NumericTerm) return acc + t.number;
            // Note: Operator term arithmetic is complex to redo manually nicely.
            // Easier trick:
            return acc;
        }, 0);

        // Actually, Roll.evaluate() is effectively done. We just mutated results.
        // We can force re-eval logic:
        roll._total = roll._evaluateTotal();
    }

    async _updateMessage(roll, flavorUpdate) {
        const message = game.messages.get(this.messageId);

        // We need to regenerate the content using the shared logic.
        // This effectively duplicates some logic from ActorSheet._executeSkillRoll
        // Refactoring that into a static helper or shared helper would be best, 
        // but for now we will inline the necessary localized render logic.

        // 1. Reconstruct Data
        // We need 'baseModifier' which isn't stored in the Roll.
        // We can try to reverse engineer it or hope it's in the flags?
        // Best practice: Store baseModifier in flags during original creation!

        // Let's assume we update `actor-sheet.mjs` to store context in flags first.
        // For now, let's try to extract it from the old content or flags if available.
        // If not, we might struggle to render the exact same tooltip.

        // CRITICAL: We need to modify `actor-sheet.mjs` to store `baseModifier` and `TN` in flags.sla context.

        // Fallback checks
        const flags = message.flags.sla || {};
        const baseModifier = flags.baseModifier || 0;
        const TN = 11;

        // Recalculate SD
        // Note: If we added a modifier term (Term 3 & 4), we need to account for it in "SD Total"

        // Find Luck Bonus
        let luckBonus = 0;
        if (roll.terms.length > 3) {
            // Check for our manually added terms
            for (let i = 3; i < roll.terms.length; i++) {
                if (roll.terms[i] instanceof foundry.dice.terms.NumericTerm && roll.terms[i].options.flavor === "Luck") {
                    luckBonus += roll.terms[i].number;
                }
            }
        }

        const sdRaw = roll.terms[0].results[0].result;
        const sdTotal = sdRaw + baseModifier + luckBonus;
        // 1. Initial Success Check
        let isSuccess = sdTotal >= TN;
        let resultColor = isSuccess ? '#39ff14' : '#f55';

        // Rebuild Skill Dice Data
        let skillDiceData = [];
        let skillSuccessCount = 0;
        if (roll.terms.length > 2) {
            roll.terms[2].results.forEach(r => {
                let val = r.result + baseModifier;
                let isHit = val >= TN;
                if (isHit) skillSuccessCount++;

                skillDiceData.push({
                    raw: r.result,
                    total: val,
                    borderColor: isHit ? "#39ff14" : "#555",
                    textColor: isHit ? "#39ff14" : "#ccc"
                });
            });
        }

        // Generate Tooltips
        // We mimic `_generateTooltip`
        let tooltipHtml = `<div class="dice-tooltip" style="display:none; margin-top:10px; padding-top:5px; border-top:1px solid #444; font-size:0.8em; color:#ccc;">`;
        tooltipHtml += `<div><strong>Success Die:</strong> Raw ${sdRaw} + Base ${baseModifier} + Luck ${luckBonus} = <strong>${sdTotal}</strong></div>`;
        if (roll.terms.length > 2) {
            tooltipHtml += `<div style="border-top:1px dashed #444; margin-top:2px;"><strong>Skill Dice (Base ${baseModifier}):</strong></div>`;
            tooltipHtml += `<div style="display:flex; flex-wrap:wrap; gap:5px; margin-top:2px;">`;
            roll.terms[2].results.forEach(r => {
                tooltipHtml += `<span style="background:#222; border:1px solid #555; padding:1px 4px;">${r.result} + ${baseModifier} = <strong>${r.result + baseModifier}</strong></span>`;
            });
            tooltipHtml += `</div>`;
        }
        tooltipHtml += `</div>`;


        // 3. MOS Calculation (Replicated from ActorSheet)
        const autoSkillSuccesses = flags.autoSkillSuccesses || 0;
        skillSuccessCount += autoSkillSuccesses; // Add auto hits (e.g. Concentrate)

        // --- SUCCESS THROUGH EXPERIENCE (Luck Check) ---
        let successThroughExperience = false;
        if (!isSuccess && skillSuccessCount >= 4) {
            isSuccess = true;
            successThroughExperience = true;
            // Append note to flavor update
            if (flavorUpdate) flavorUpdate += " | Success Through Experience";
            else flavorUpdate = "Success Through Experience";
        }

        // Update Result Color if it became a success
        if (isSuccess) resultColor = '#39ff14';

        let mosDamageBonus = 0;
        let mosEffectText = isSuccess ? "Standard Hit" : "Failed";
        let mosChoiceData = { hasChoice: false, choiceType: "", choiceDmg: 0 };


        if (isSuccess && !successThroughExperience) {
            if (skillSuccessCount === 1) {
                mosDamageBonus = 1;
                mosEffectText = "+1 Damage";
            } else if (skillSuccessCount === 2) {
                mosEffectText = "MOS 2: Choose Effect";
                mosChoiceData = { hasChoice: true, choiceType: "arm", choiceDmg: 2 };
            } else if (skillSuccessCount === 3) {
                mosEffectText = "MOS 3: Choose Effect";
                mosChoiceData = { hasChoice: true, choiceType: "leg", choiceDmg: 4 };
            } else if (skillSuccessCount >= 4) {
                mosDamageBonus = 6;
                mosEffectText = "<strong style='color:#ff5555'>HEAD SHOT</strong> (+6 DMG)";
            }
        }

        // 4. Damage Formula Calculation
        const baseDmg = flags.damageBase || "0";
        const damageMod = flags.damageMod || 0;
        const totalMod = damageMod + mosDamageBonus;

        let finalDmgFormula = baseDmg;
        if (totalMod !== 0) {
            if (baseDmg === "0" || baseDmg === "") finalDmgFormula = String(totalMod);
            else finalDmgFormula = `${baseDmg} ${totalMod > 0 ? "+" : ""} ${totalMod}`;
        }

        const showButton = isSuccess && (finalDmgFormula && finalDmgFormula !== "0");


        const templateData = {
            borderColor: resultColor,
            headerColor: isSuccess ? "#39ff14" : "#f55",
            resultColor: resultColor,
            itemName: flags.itemName || "SKILL",
            successTotal: sdTotal,
            tooltip: tooltipHtml,
            skillDice: skillDiceData,
            notes: flavorUpdate,
            showDamageButton: showButton,
            dmgFormula: finalDmgFormula,
            adValue: flags.adValue || 0,
            mos: {
                isSuccess: isSuccess,
                hits: skillSuccessCount,
                effect: mosEffectText,
                ...mosChoiceData
            },
            // Hide the button after use
            luckSpent: true,
            actorUuid: this.actor.uuid
        };

        const chatContent = await renderTemplate("systems/sla-industries/templates/chat/chat-weapon-rolls.hbs", templateData);

        await message.update({
            content: chatContent,
            rolls: [JSON.stringify(roll)],
            "flags.sla.luckSpent": true // Persist used state
        });
    }
}
