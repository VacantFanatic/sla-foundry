import { calculateRollResult, getMOS, generateDiceTooltip } from "../helpers/dice.mjs";

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

        // 1. Reconstruct Data
        const flags = message.flags.sla || {};
        const baseModifier = flags.baseModifier || 0;
        const autoSkillSuccesses = flags.autoSkillSuccesses || 0;

        // Find Luck Bonus already in the roll terms
        let luckBonus = 0;
        if (roll.terms.length > 3) {
            for (let i = 3; i < roll.terms.length; i++) {
                if (roll.terms[i] instanceof foundry.dice.terms.NumericTerm && roll.terms[i].options.flavor === "Luck") {
                    luckBonus += roll.terms[i].number;
                }
            }
        }

        // 2. Use Helper for Calculation
        const result = calculateRollResult(roll, baseModifier, 11, {
            luckBonus: luckBonus,
            autoSkillSuccesses: autoSkillSuccesses
        });

        // 3. MOS & Effect Calculation
        const mos = getMOS(result);

        if (result.successThroughExperience) {
            if (flavorUpdate) flavorUpdate += " | Success Through Experience";
            else flavorUpdate = "Success Through Experience";
        }

        // 4. Damage Formula Logic
        const baseDmg = flags.damageBase || "0";
        const damageMod = flags.damageMod || 0;
        const totalMod = damageMod + mos.damageBonus;

        let finalDmgFormula = baseDmg;
        if (totalMod !== 0) {
            if (baseDmg === "0" || baseDmg === "") finalDmgFormula = String(totalMod);
            else finalDmgFormula = `${baseDmg} ${totalMod > 0 ? "+" : ""} ${totalMod}`;
        }

        const showButton = result.isSuccess && (finalDmgFormula && finalDmgFormula !== "0");

        // 5. Render Template
        const templateData = {
            borderColor: result.isSuccess ? '#39ff14' : '#f55',
            headerColor: result.isSuccess ? '#39ff14' : '#f55',
            resultColor: result.isSuccess ? '#39ff14' : '#f55',
            itemName: flags.itemName || "SKILL",
            successTotal: result.total,
            tooltip: generateDiceTooltip(roll, baseModifier, luckBonus),
            skillDice: result.skillDiceData,
            notes: flavorUpdate,
            showDamageButton: showButton,
            dmgFormula: finalDmgFormula,
            adValue: flags.adValue || 0,
            mos: {
                isSuccess: result.isSuccess,
                hits: result.skillHits,
                effect: mos.effect,
                hasChoice: mos.hasChoice,
                choiceType: mos.choiceType,
                choiceDmg: mos.choiceDmg
            },
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
