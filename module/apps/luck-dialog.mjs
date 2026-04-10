import { calculateRollResult, getMOS, generateDiceTooltip } from "../helpers/dice.mjs";
import { syncEbbCriticalFlux } from "../helpers/ebb-flux.mjs";
import { normalizeEbbEffect } from "../helpers/items.mjs";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

/**
 * Dialog for spending Luck points (Application V2).
 */
export class LuckDialog extends HandlebarsApplicationMixin(ApplicationV2) {

    /** @override */
    static PARTS = {
        body: {
            template: "systems/sla-industries/templates/dialogs/luck-dialog.hbs"
        }
    };

    static async rerollSd() {
        await this._applyRerollSD();
        this.close();
    }

    static async addMod() {
        const input = this.element.querySelector("input[name='modAmount']");
        const amount = Number(input?.value);
        await this._applyModifier(amount);
        this.close();
    }

    static async rerollSkill() {
        const checked = this.element.querySelectorAll("input[name='rerollSelect']:checked");
        const indices = Array.from(checked).map(el => Number(el.value));
        if (indices.length === 0) {
            ui.notifications.warn("Select at least one die to reroll.");
            return;
        }
        await this._applyRerollSkill(indices);
        this.close();
    }

    /** @override */
    static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
        tag: "div",
        position: { width: 400 },
        window: { title: "Use Luck" },
        classes: [],
        actions: {
            rerollSd: LuckDialog.rerollSd,
            addMod: LuckDialog.addMod,
            rerollSkill: LuckDialog.rerollSkill
        }
    }, { inplace: false });

    /**
     * @param {Actor} actor
     * @param {Roll} roll
     * @param {string} messageId
     * @param {object} luckContext — from {@link LuckDialog.prepareContext}
     * @param {object} [appOptions]
     */
    constructor(actor, roll, messageId, luckContext, appOptions = {}) {
        super(appOptions);
        this.actor = actor;
        this.roll = roll;
        this.messageId = messageId;
        this._luckContext = luckContext;
    }

    /** @override */
    async _prepareContext() {
        const context = await super._prepareContext();
        return foundry.utils.mergeObject(context, this._luckContext);
    }

    /**
     * Build context for the luck template; used by {@link LuckDialog.create}.
     */
    static async prepareContext(actor, roll, messageId) {
        let skillDice = [];
        if (roll.terms.length > 2 && roll.terms[2].results) {
            skillDice = roll.terms[2].results.map(r => ({
                result: r.result,
                total: r.result,
                borderColor: r.success ? "#39ff14" : "#555"
            }));
        }

        const message = game.messages.get(messageId);
        const flags = message.flags.sla || {};
        if (flags.luckSpent) {
            ui.notifications.warn("SLA | Luck has already been spent on this roll. Only one option may be applied per roll.");
            return null;
        }

        const rofRerollSD = flags.rofRerollSD || false;
        const rofRerollSkills = flags.rofRerollSkills || [];

        skillDice.forEach((d, i) => {
            if (rofRerollSkills.includes(i)) {
                d.disabled = true;
                d.borderColor = "#555";
                d.tooltip = "Already rerolled via ROF";
            }
        });

        return {
            luck: actor.system.stats.luck,
            skillDice: skillDice,
            rofRerollSD: rofRerollSD
        };
    }

    /**
     * Factory method to create and render the dialog.
     */
    static async create(actor, roll, messageId) {
        const luckContext = await LuckDialog.prepareContext(actor, roll, messageId);
        if (!luckContext) return;

        const dlg = new LuckDialog(actor, roll, messageId, luckContext, {});
        await dlg.render(true);
        return dlg;
    }

    _resolveDamageDisplay(formula) {
        const formulaStr = String(formula ?? "0").trim();
        if (!formulaStr || formulaStr === "0") return "0";
        if (formulaStr.includes("d")) return formulaStr;
        try {
            const replaced = Roll.replaceFormulaData(formulaStr, this.actor.getRollData());
            const resolved = Math.round(Number(Function('"use strict";return (' + replaced + ')')()));
            return Number.isFinite(resolved) ? String(Math.max(0, resolved)) : formulaStr;
        } catch (_err) {
            return formulaStr;
        }
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

        const roll = this.roll;
        const successDie = roll.terms[0];
        const newRoll = new Roll("1d10");
        await newRoll.evaluate();

        if (newRoll.terms[0]) {
            newRoll.terms[0].options.appearance = {
                foreground: "#FFFFFF",
                background: "#000000",
                edge: "#333333"
            };
        }

        if (game.dice3d) {
            await game.dice3d.showForRoll(newRoll, game.user, true);
        }
        const newResult = newRoll.terms[0].results[0];

        successDie.results[0] = newResult;

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

        const skillDieTerm = roll.terms[2];
        if (!skillDieTerm) return;

        for (const index of indices) {
            if (skillDieTerm.results[index]) {
                const subRoll = new Roll("1d10");
                await subRoll.evaluate();

                if (game.dice3d) {
                    await game.dice3d.showForRoll(subRoll, game.user, true);
                }

                skillDieTerm.results[index] = subRoll.terms[0].results[0];
            }
        }

        this._updateRollTotal(roll);
        await this._updateMessage(roll, `Rerolled ${indices.length} Skill Dice (Luck)`);
    }

    _updateRollTotal(roll) {
        roll._total = roll._evaluateTotal();
    }

    async _updateMessage(roll, flavorUpdate) {
        const message = game.messages.get(this.messageId);

        const flags = message.flags.sla || {};
        const baseModifier = flags.baseModifier || 0;
        const autoSkillSuccesses = flags.autoSkillSuccesses || 0;

        let luckBonus = 0;
        if (roll.terms.length > 3) {
            for (let i = 3; i < roll.terms.length; i++) {
                if (roll.terms[i] instanceof foundry.dice.terms.NumericTerm && roll.terms[i].options.flavor === "Luck") {
                    luckBonus += roll.terms[i].number;
                }
            }
        }

        const tn = flags.tn != null ? Number(flags.tn) : 10;
        const result = calculateRollResult(roll, baseModifier, tn, {
            luckBonus: luckBonus,
            autoSkillSuccesses: autoSkillSuccesses
        });

        let mosEffectText;
        let mosDamageBonus = 0;
        let mosHasChoice = false;
        let mosChoiceType = "";
        let mosChoiceDmg = 0;

        if (flags.isEbb) {
            const skillHits = result.skillHits;
            const attackMos = normalizeEbbEffect(flags.ebbEffect) === "damage";
            mosEffectText = result.isSuccess ? "Standard Success" : "Failed";
            if (result.isSuccess) {
                if (skillHits === 2) {
                    mosEffectText = attackMos ? "+1 Damage / Effect" : "Standard Success";
                    if (attackMos) mosDamageBonus = 1;
                } else if (skillHits === 3) {
                    mosEffectText = attackMos
                        ? "+2 Damage / Repeat Ability"
                        : "May use the same Ebb ability again within 5 minutes (-3 FLUX)";
                    if (attackMos) mosDamageBonus = 2;
                } else if (skillHits >= 4) {
                    mosEffectText = attackMos
                        ? "<strong style='color:#39ff14'>CRITICAL:</strong> +4 Dmg | Regain 1 FLUX"
                        : "<strong style='color:#39ff14'>CRITICAL:</strong> Regain 1 FLUX";
                    if (attackMos) mosDamageBonus = 4;
                }
            }
        } else {
            const mos = getMOS(result);
            mosEffectText = mos.effect;
            mosDamageBonus = mos.damageBonus;
            mosHasChoice = mos.hasChoice;
            mosChoiceType = mos.choiceType;
            mosChoiceDmg = mos.choiceDmg;
        }

        if (result.successThroughExperience) {
            if (flavorUpdate) flavorUpdate += " | Success Through Experience";
            else flavorUpdate = "Success Through Experience";
        }

        const baseDmg = flags.damageBase || "0";
        const damageMod = flags.damageMod || 0;
        const totalMod = damageMod + mosDamageBonus;

        let finalDmgFormula = baseDmg;
        if (totalMod !== 0) {
            if (baseDmg === "0" || baseDmg === "") finalDmgFormula = String(totalMod);
            else finalDmgFormula = `${baseDmg} ${totalMod > 0 ? "+" : ""} ${totalMod}`;
        }

        const showButton = result.isSuccess && (finalDmgFormula && finalDmgFormula !== "0");

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
            dmgDisplay: this._resolveDamageDisplay(finalDmgFormula),
            adValue: flags.adValue || 0,
            mos: {
                isSuccess: result.isSuccess,
                hits: result.skillHits,
                effect: mosEffectText,
                hasChoice: mosHasChoice,
                choiceType: mosChoiceType,
                choiceDmg: mosChoiceDmg
            },
            luckSpent: true,
            canUseLuck: this.actor.system.stats.luck.value > 0,
            luckValue: this.actor.system.stats.luck.value,
            actorUuid: this.actor.uuid
        };

        const chatContent = await foundry.applications.handlebars.renderTemplate("systems/sla-industries/templates/chat/chat-weapon-rolls.hbs", templateData);

        await message.update({
            content: chatContent,
            rolls: [JSON.stringify(roll)],
            "flags.sla.luckSpent": true
        });

        if (flags.isEbb) {
            await syncEbbCriticalFlux(message, this.actor, message.flags?.sla ?? flags, result.isSuccess, result.skillHits);
        }
    }
}
