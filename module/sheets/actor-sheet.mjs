/**
 * Extend the basic ActorSheet
 * @extends {ActorSheet}
 */
import { LuckDialog } from "../apps/luck-dialog.mjs";
import { calculateRollResult, generateDiceTooltip, createSLARoll } from "../helpers/dice.mjs";
import { prepareItems } from "../helpers/items.mjs";
import { applyMeleeModifiers, applyRangedModifiers, calculateRangePenalty } from "../helpers/modifiers.mjs";

export class SlaActorSheet extends foundry.appv1.sheets.ActorSheet {

    /** @override */
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["sla-industries", "sheet", "actor"],
            template: "systems/sla-industries/templates/actor/actor-sheet.hbs",
            width: 850,
            height: 850,
            tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "main", group: "primary" }]
        });
    }

    /** @override */
    get template() {
        const path = "systems/sla-industries/templates/actor";
        if (this.actor.type === 'npc') return `${path}/actor-npc-sheet.hbs`;
        return `${path}/actor-sheet.hbs`;
    }

    /* -------------------------------------------- */
    /* DATA PREPARATION                            */
    /* -------------------------------------------- */

    /** @override */
    async getData() {
        const context = await super.getData();
        // CRITICAL FIX: Use 'this.actor.system' to access runtime derived data (like .total)
        // context.data (from super.getData) only contains the database properties in some versions.
        context.system = this.actor.system;
        context.flags = this.actor.flags;

        // ... (Keep your existing stats/ratings/wounds initialization) ...
        context.system.stats = context.system.stats || {};
        context.system.ratings = context.system.ratings || {};
        context.system.wounds = context.system.wounds || {};
        context.system.move = context.system.move || {};
        context.system.conditions = context.system.conditions || {};

        // ======================================================
        // START NEW LOGIC: SYNC CONDITIONS FOR DISPLAY
        // ======================================================
        // This forces the sheet to look at the actual Active Effects 
        // on the token and update the context so the buttons light up.
        const conditionIds = ["bleeding", "burning", "stunned", "prone", "immobile", "critical"];

        for (const statusId of conditionIds) {
            // Check if the actor has an Active Effect with this statusId
            // We use 'this.actor' to get the live document instance
            const hasEffect = this.actor.effects.some(e => e.statuses.has(statusId));
            context.system.conditions[statusId] = hasEffect;
        }
        // ======================================================
        // END NEW LOGIC
        // ======================================================

        context.rollData = context.actor.getRollData();

        if (this.actor.type == 'character' || this.actor.type == 'npc') {
            this._prepareItems(context);
        }

        // ... (Keep existing speciesList logic) ...

        context.speciesItem = this.actor.items.find(i => i.type === "species");
        context.packageItem = this.actor.items.find(i => i.type === "package");

        // --- CHECK IF EBONITE ---
        if (context.speciesItem && context.speciesItem.name) {
            context.isEbonite = context.speciesItem.name.toLowerCase().includes("ebonite");
        } else {
            context.isEbonite = false;
        }

        context.enrichedBiography = await foundry.applications.ux.TextEditor.enrichHTML(this.actor.system.biography, { async: true, relativeTo: this.actor });
        context.enrichedAppearance = await foundry.applications.ux.TextEditor.enrichHTML(this.actor.system.appearance, { async: true, relativeTo: this.actor });
        context.enrichedNotes = await foundry.applications.ux.TextEditor.enrichHTML(this.actor.system.notes, { async: true, relativeTo: this.actor });

        return context;
    }

    _prepareItems(context) {
        // Use the helper function to prepare items
        const itemData = prepareItems(context.items, context.rollData);
        
        // Assign to context
        Object.assign(context, itemData);
    }

    /* -------------------------------------------- */
    /* EVENT LISTENERS                              */
    /* -------------------------------------------- */

    /** @override */
    activateListeners(html) {
        super.activateListeners(html);
        if (!this.isEditable) return;

        // --- HEADER DELETE (SPECIES) ---
        html.find('.chip-delete[data-type="species"]').click(async ev => {
            ev.preventDefault(); ev.stopPropagation();
            const speciesItem = this.actor.items.find(i => i.type === "species");
            if (!speciesItem) return;

            Dialog.confirm({
                title: "Remove Species?",
                content: `<p>Remove <strong>${speciesItem.name}</strong>?</p>`,
                yes: async () => {
                    // 1. Find all skills linked to this species
                    const skillsToDelete = this.actor.items
                        .filter(i => i.getFlag("sla-industries", "fromSpecies"))
                        .map(i => i.id);

                    // 2. Delete Items -> PREVENT RENDER HERE ({ render: false })
                    // This stops the sheet from refreshing halfway through, preventing the crash.
                    await this.actor.deleteEmbeddedDocuments("Item", [speciesItem.id, ...skillsToDelete], { render: false });

                    // 3. Reset Stats -> THIS triggers the single, final render
                    const resets = { "system.bio.species": "" };
                    ["str", "dex", "know", "conc", "cha", "cool"].forEach(k => resets[`system.stats.${k}.value`] = 1);

                    await this.actor.update(resets);
                }
            });
        });

        // DRUG USE ICON
        html.find('.item-use-drug').click(async ev => {
            ev.preventDefault();
            const li = $(ev.currentTarget).parents(".item");
            const item = this.actor.items.get(li.data("itemId"));

            if (!item || item.type !== "drug") return;

            const currentQty = item.system.quantity || 0;

            // Safety check
            if (currentQty <= 0) {
                // If it's 0, just delete it immediately to clean up
                return item.delete();
            }

            const newQty = currentQty - 1;

            // 1. Post Chat Message (Do this first while item exists)
            // 1. Post Chat Message (Do this first while item exists)
            const templateData = {
                itemName: item.name.toUpperCase(),
                actorName: this.actor.name,
                duration: item.system.duration || "Unknown",
                remaining: newQty
            };
            const content = await foundry.applications.handlebars.renderTemplate("systems/sla-industries/templates/chat/drug-use.hbs", templateData);

            ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                content: content
            });

            // 2. Update or Delete
            if (newQty <= 0) {
                await item.delete();
                ui.notifications.info(`Used the last dose of ${item.name}.`);
            } else {
                await item.update({ "system.quantity": newQty });
            }
        });

        // --- HEADER DELETE (PACKAGE) ---
        html.find('.chip-delete[data-type="package"]').click(async ev => {
            ev.preventDefault(); ev.stopPropagation();
            const packageItem = this.actor.items.find(i => i.type === "package");
            if (!packageItem) return;

            Dialog.confirm({
                title: "Remove Package?",
                content: `<p>Remove <strong>${packageItem.name}</strong>?</p>`,
                yes: async () => {
                    const skillsToDelete = this.actor.items
                        .filter(i => i.getFlag("sla-industries", "fromPackage"))
                        .map(i => i.id);

                    // Fix applied here as well:
                    await this.actor.deleteEmbeddedDocuments("Item", [packageItem.id, ...skillsToDelete], { render: false });
                    await this.actor.update({ "system.bio.package": "" });
                }
            });
        });

        // --- INLINE ITEM EDITING ---
        html.find('.inline-edit').change(async ev => {
            ev.preventDefault();
            const input = ev.currentTarget;
            const itemId = input.dataset.itemId || $(input).parents(".item").data("itemId");
            if (!itemId) return;

            const item = this.actor.items.get(itemId);
            const field = input.dataset.field;

            if (item && field) {
                await item.update({ [field]: Number(input.value) });
            }
        });

        html.find('.item-edit').click(ev => {
            const li = $(ev.currentTarget).parents(".item");
            const item = this.actor.items.get(li.data("itemId"));
            if (item) item.sheet.render(true);
        });

        html.find('.item-delete').click(ev => {
            const li = $(ev.currentTarget).parents(".item");
            const item = this.actor.items.get(li.data("itemId"));
            if (item) Dialog.confirm({ title: "Delete Item?", content: "<p>Are you sure?</p>", yes: () => { item.delete(); li.slideUp(200, () => this.render(false)); } });
        });

        html.find('.item-toggle').click(ev => {
            const li = $(ev.currentTarget).parents(".item");
            const item = this.actor.items.get(li.data("itemId"));
            if (item.type === 'drug') item.toggleActive();
            else item.update({ "system.equipped": !item.system.equipped });
        });

        // --- NEW: Rollable Icon Listener ---
        html.find('.item-rollable').click(ev => this._onRoll(ev));


        html.find('.item-reload').click(this._onReloadWeapon.bind(this));
        html.find('.item-create').click(this._onItemCreate.bind(this));
        html.find('.rollable').click(this._onRoll.bind(this));

        // --- CONDITIONS TOGGLE ---
        html.find('.condition-toggle').click(async ev => {
            ev.preventDefault();
            const conditionId = ev.currentTarget.dataset.condition;
            // This toggles the Active Effect on the Token
            await this.actor.toggleStatusEffect(conditionId);
            // The sheet will re-render, and getData() will now see the effect and light up the icon.
        });

        // --- WOUND CHECKBOXES ---
        html.find('.wound-checkbox').change(async ev => {
            const target = ev.currentTarget;
            const isChecked = target.checked;
            const field = target.name;

            // Update the actor. The _onUpdate method in Actor.mjs will handle
            // the side effects (Bleeding, Stunned, Immobile).
            await this.actor.update({ [field]: isChecked });
        });

        // --- COMPENDIUM LINKS ---
        html.find('.open-compendium').click(ev => {
            ev.preventDefault();
            const dataset = ev.currentTarget.dataset;
            const compendiumId = dataset.compendium;
            const pack = game.packs.get(compendiumId);
            if (pack) {
                pack.render(true);
            } else {
                ui.notifications.warn(`Compendium '${compendiumId}' not found.`);
            }
        });
    }

    // --- RELOAD LOGIC (Match by Linked Weapon Name) ---
    async _onReloadWeapon(event) {
        event.preventDefault();
        const li = $(event.currentTarget).parents(".item");
        const weapon = this.actor.items.get(li.data("itemId"));
        const weaponName = weapon.name;

        // Find all magazines that claim to link to this weapon
        const candidates = this.actor.items.filter(i =>
            i.type === "magazine" &&
            i.system.linkedWeapon === weaponName &&
            (i.system.quantity > 0)
        );

        if (candidates.length === 0) {
            return ui.notifications.warn(`No magazines found linked to: '${weaponName}'`);
        }

        // If only one match, just do it
        if (candidates.length === 1) {
            return this._performReload(weapon, candidates[0]);
        }

        // If multiple matches, Prompt User
        const content = await foundry.applications.handlebars.renderTemplate("systems/sla-industries/templates/dialogs/reload-dialog.hbs", {
            weaponName: weaponName,
            candidates: candidates
        });

        new Dialog({
            title: "Select Ammunition",
            content: content,
            buttons: {
                load: {
                    label: "Load Magazine",
                    callback: (html) => {
                        const magId = html.find('#magazine-select').val();
                        const mag = this.actor.items.get(magId);
                        if (mag) this._performReload(weapon, mag);
                    }
                }
            },
            default: "load"
        }, { classes: ["sla-dialog", "sla-sheet"] }).render(true);
    }

    async _performReload(weapon, magazine) {
        // 1. Determine Capacity from Magazine
        const capacity = magazine.system.ammoCapacity || 10;

        // 2. Update Weapon Ammo AND Max Ammo (so we know the clip size)
        await weapon.update({
            "system.ammo": capacity,
            "system.maxAmmo": capacity
        });

        // 3. Consume Magazine
        const newQty = (magazine.system.quantity || 1) - 1;

        if (newQty <= 0) {
            await magazine.delete();
            ui.notifications.info(`Reloaded ${weapon.name} with ${magazine.name}. Magazine depleted.`);
        } else {
            await magazine.update({ "system.quantity": newQty });
            ui.notifications.info(`Reloaded ${weapon.name} with ${magazine.name}. ${newQty} remaining.`);
        }
    }

    /* -------------------------------------------- */
    /* ROLL HANDLERS                               */
    /* -------------------------------------------- */


    /* Handle clickable rolls.
     * @param {Event} event   The originating click event
     * @private
     */
    async _onRoll(event) {
        event.preventDefault();
        const element = event.currentTarget;
        const dataset = element.dataset;

        // Handle Item Rolls (triggered by your crosshairs icon)
        if (dataset.rollType === 'item') {
            const itemId = $(element).parents('.item').data('itemId');
            const item = this.actor.items.get(itemId);
            if (item.type === 'weapon') {
                // NEW LOGIC: Check the explicit 'attackType' property
                // We default to "melee" if the property is missing (e.g. on old items)
                const attackType = item.system.attackType || "melee";

                // Determine boolean for your dialog function
                const isMelee = (attackType === "melee");

                // --- TARGET ENFORCEMENT ---
                // User requirement: Must have a target if using a weapon (excluding explosives)
                if (game.user.targets.size === 0) {
                    ui.notifications.warn("You must select a target to attack.");
                    return;
                }
                // --------------------------

                // Pass the flag to your existing dialog renderer
                await this._renderAttackDialog(item, isMelee);

            }
            else if (item.type === 'explosive') {
                await this._renderExplosiveDialog(item);
            }
            else if (item.type === 'ebbFormula') {
                this._executeEbbRoll(item);
            } else {
                item.sheet.render(true);
            }
        }

        let globalMod = 0;
        if (this.actor.system.conditions?.prone) globalMod -= 1;
        if (this.actor.system.conditions?.stunned) globalMod -= 1;

        // STAT ROLL
        if (dataset.rollType === 'stat') {
            const statKey = dataset.key.toLowerCase();
            const statLabel = statKey.toUpperCase();
            const statValue = this.actor.system.stats[statKey]?.total ?? this.actor.system.stats[statKey]?.value ?? 0;
            const penalty = this.actor.system.wounds.penalty || 0;
            const finalMod = statValue - penalty + globalMod;

            let roll = createSLARoll("1d10");
            // ---------------------------------------------
            await roll.evaluate();

            let rawDie = roll.terms[0].results[0].result;
            let finalTotal = rawDie + finalMod;
            const resultColor = finalTotal > 10 ? '#39ff14' : '#f55';

            const tooltipHtml = this._generateTooltip(roll, finalMod, 0, 0);

            const isSuccess = finalTotal > 10;

            const templateData = {
                borderColor: resultColor,
                headerColor: resultColor,
                resultColor: resultColor,
                actorUuid: this.actor.uuid,
                itemName: `${statLabel} CHECK`,
                successTotal: finalTotal,
                tooltip: tooltipHtml,
                skillDice: [],
                notes: "",
                showDamageButton: false,
                // Luck Data
                canUseLuck: this.actor.system.stats.luck.value > 0,
                luckValue: this.actor.system.stats.luck.value,
                luckSpent: false,
                mos: {
                    isSuccess: isSuccess,
                    hits: 0,
                    effect: isSuccess ? "Success" : "Failure"
                }
            };

            const chatContent = await foundry.applications.handlebars.renderTemplate("systems/sla-industries/templates/chat/chat-weapon-rolls.hbs", templateData);

            roll.toMessage({
                speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                content: chatContent,
                flags: {
                    sla: {
                        baseModifier: finalMod,
                        itemName: `${statLabel} CHECK`
                    }
                }
            });
        }

        if (dataset.rollType === 'skill') {
            this._executeSkillRoll(element);
        }

        if (dataset.rollType === 'init') {
            await this.actor.rollInitiative({ createCombatants: true });
        }
    }

    // --- DIALOG ---
    async _renderAttackDialog(item, isMelee) {

        // 1. Prepare Firing Modes (Ranged Only)
        let validModes = {};
        let defaultModeKey = "";

        if (!isMelee && item.system.firingModes) {
            // Filter down to only active modes
            validModes = Object.entries(item.system.firingModes)
                .filter(([key, data]) => data.active)
                .reduce((obj, [key, data]) => {
                    obj[key] = data; // Keep the full data object so we can read recoil later
                    return obj;
                }, {});

            // Safety Fallback: If no modes active, default to Single
            if (Object.keys(validModes).length === 0) {
                validModes["single"] = { label: "Single", active: true, rounds: 1, recoil: 0 };
            }

            // Pick the first valid mode as the default selection
            defaultModeKey = Object.keys(validModes)[0];
        }

        // --- RANGE CALCULATION ---
        let rangePenaltyMsg = "";
        let isLongRange = false;

        if (!isMelee && game.user.targets.size > 0) {
            // Robust Token Retrieval
            const token = this.actor.token?.object || this.token || (this.actor.getActiveTokens().length > 0 ? this.actor.getActiveTokens()[0] : null);

            if (!token) {
                return ui.notifications.warn("Cannot perform ranged attack: No token found for this actor in the current scene.");
            }

            const target = game.user.targets.first();
            // Get Weapon Range
            const strRange = item.system.range || "10";
            const maxRange = parseInt(strRange) || 10; // Simple integer parse

            // Use helper function
            const rangeData = calculateRangePenalty(token, target, maxRange);
            isLongRange = rangeData.isLongRange;
            rangePenaltyMsg = rangeData.penaltyMsg;
        }
        // -------------------------

        // 2. Prepare Template Data
        const templateData = {
            item: item,
            isMelee: isMelee,
            validModes: validModes,
            selectedMode: defaultModeKey, // Pass this to HBS for the <select>
            rangePenaltyMsg: rangePenaltyMsg, // Display logic inside template might be needed, or we just rely on implicit knowledge for now?
            // Actually, we should probably Pass 'isLongRange' to the process function via a hidden field or reconstruct it,
            // BUT simpler to just reconstruct it in _processWeaponRoll since we enforce target selection now.

            // Melee uses item recoil (usually 0), Ranged uses the recoil of the default mode
            recoil: isMelee
                ? (item.system.recoil || 0)
                : (validModes[defaultModeKey]?.recoil || 0),

            // AIM DATA
            canAim: ["pistol", "rifle"].includes((item.system.skill || "").toLowerCase()),
            aimLimit: (() => {
                const sKey = (item.system.skill || "").toLowerCase();
                const sItem = this.actor.items.find(i => i.type === 'skill' && i.name.toLowerCase() === sKey);
                return sItem ? (sItem.system.rank || 0) : 0;
            })()
        };
        // NOTE: If we want to show the message, we need to edit the HBS.
        // For now, we will perform the calculation silently in _processWeaponRoll OR add it as a Note.
        // Let's pass it as 'rangeMsg' to see if we can easily slot it in, or just rely on the user knowing.

        const content = await foundry.applications.handlebars.renderTemplate("systems/sla-industries/templates/dialogs/attack-dialog.hbs", templateData);

        new Dialog({
            title: `Attack: ${item.name} ${rangePenaltyMsg}`,
            content: content,
            buttons: {
                roll: {
                    label: "ROLL",
                    callback: (html) => this._processWeaponRoll(item, html, isMelee)
                }
            },
            default: "roll"
        }, {
            classes: ["sla-dialog-window", "dialog"]
        }).render(true);
    }

    async _executeSkillRoll(element) {
        // 1. GET ITEM & DATA
        const itemId = $(element).parents('.item').data('itemId');
        const item = this.actor.items.get(itemId);
        if (!item) return;

        const statKey = item.system.stat || "dex";
        const statValue = this.actor.system.stats[statKey]?.total ?? this.actor.system.stats[statKey]?.value ?? 0;

        // Default rank to 0 if missing
        const rank = Number(item.system.rank) || 0;

        // 2. MODIFIERS (Wounds, Prone, Stunned)
        let globalMod = 0;
        if (this.actor.system.conditions?.prone) globalMod -= 1;
        if (this.actor.system.conditions?.stunned) globalMod -= 1;
        const penalty = this.actor.system.wounds.penalty || 0;

        const baseModifier = statValue + rank + globalMod - penalty;

        // 3. ROLL FORMULA
        // Unskilled Rule: If Rank 0, still roll.
        // Rule: "Success Die and one Skill Die for each rank... plus one"
        // So Rank 0 = 1 Skill Die. Rank 1 = 2 Skill Dice.
        const skillDiceCount = rank + 1;
        const rollFormula = `1d10 + ${skillDiceCount}d10`;

        let roll = createSLARoll(rollFormula);
        // ---------------------------------------------
        await roll.evaluate();

        // 4. CALCULATE SUCCESS
        const result = calculateRollResult(roll, baseModifier);
        const resultColor = result.isSuccess ? '#39ff14' : '#f55';

        // 6. RENDER TEMPLATE
        const templateData = {
            borderColor: resultColor,
            headerColor: resultColor,
            resultColor: resultColor,
            actorUuid: this.actor.uuid,
            itemName: item.name.toUpperCase(),
            successTotal: result.total,
            tooltip: generateDiceTooltip(roll, baseModifier),
            skillDice: result.skillDiceData,
            notes: "",
            notes: "",
            showDamageButton: false, // Ensure Hidden for Skills
            // Luck Data
            canUseLuck: this.actor.system.stats.luck.value > 0,
            luckValue: this.actor.system.stats.luck.value,
            luckSpent: false,
            mos: {
                isSuccess: result.isSuccess,
                hits: result.skillHits,
                effect: result.isSuccess ? `Margin of Success: ${result.skillHits}` : "Failed"
            }
        };

        const chatContent = await foundry.applications.handlebars.renderTemplate("systems/sla-industries/templates/chat/chat-weapon-rolls.hbs", templateData);

        roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: chatContent,
            flags: {
                sla: {
                    baseModifier: baseModifier,
                    itemName: item.name.toUpperCase(),
                    rofRerollSD: false,
                    rofRerollSkills: []
                }
            }
        });
    }

    // --- HELPERS: HTML GENERATION ---
    // Kept for legacy compatibility if other modules call it, but uses new helper internally
    _generateTooltip(roll, baseModifier, successDieMod) {
        return generateDiceTooltip(roll, baseModifier, 0, successDieMod);
    }

    async _processWeaponRoll(item, html, isMelee) {
        const form = html[0].querySelector("form");
        if (!form) return;

        // 1. SETUP
        const statKey = "dex";
        const statValue = this.actor.system.stats[statKey]?.total ?? this.actor.system.stats[statKey]?.value ?? 0;
        const strValue = Number(this.actor.system.stats.str?.total ?? this.actor.system.stats.str?.value ?? 0);

        // Skill Lookup
        const skillInput = item.system.skill;
        let rank = 0;
        let targetSkillName = "";
        const combatSkills = CONFIG.SLA?.combatSkills || {};

        if (skillInput && combatSkills[skillInput]) targetSkillName = combatSkills[skillInput];
        else if (skillInput) targetSkillName = skillInput;

        if (targetSkillName) {
            const skillItem = this.actor.items.find(i => i.type === 'skill' && i.name.trim().toLowerCase() === targetSkillName.trim().toLowerCase());
            if (skillItem) rank = Number(skillItem.system.rank) || 0;
        }

        // Input Reading
        let mods = {
            successDie: 0,
            allDice: Number(form.modifier?.value) || 0,
            rank: 0,
            damage: 0,
            autoSkillSuccesses: 0,
            allDice: Number(form.modifier?.value) || 0,
            rank: 0,
            damage: 0,
            autoSkillSuccesses: 0,
            reservedDice: 0,
            // AIM INPUTS
            aimSd: Number(form.aim_sd?.value) || 0,
            aimAuto: Number(form.aim_auto?.value) || 0,
            // DEFENSE INPUTS
            combatDef: Number(form.combatDef?.value) || 0,
            acroDef: Number(form.acroDef?.value) || 0,
            targetProne: form.prone?.checked || false, // In Melee this is Target Prone (+2)
        };

        let notes = [];
        let flags = { rerollSD: false, rerollAll: false };

        // AIM VALIDATION
        const totalAim = mods.aimSd + mods.aimAuto;
        if (totalAim > rank) {
            ui.notifications.warn(`Total Aiming rounds (${totalAim}) cannot exceed Skill Rank (${rank}).`);
            return;
        }

        // Conditions
        if (this.actor.system.conditions?.prone) mods.allDice -= 1;
        if (this.actor.system.conditions?.stunned) mods.allDice -= 1;

        // --- AIM BONUSES ---
        if (mods.aimSd > 0) mods.successDie += mods.aimSd;
        if (mods.aimAuto > 0) mods.autoSkillSuccesses += mods.aimAuto;

        // --- RANGE PENALTY LOGIC ---
        if (!isMelee && game.user.targets.size > 0) {
            const target = game.user.targets.first();
            // Get Weapon Range
            const strRange = item.system.range || "10";
            const maxRange = parseInt(strRange) || 10;

            // Use token associated with actor, or default to checking canvas
            let token = this.actor.token?.object || this.token;
            if (!token) {
                const tokens = this.actor.getActiveTokens();
                if (tokens.length > 0) token = tokens[0];
            }

            if (token) {
                const rangeData = calculateRangePenalty(token, target, maxRange);
                if (rangeData.isLongRange) {
                    // Rulebook: "-1 Skill Die" (not Success Die)
                    mods.rank -= 1;
                    notes.push("Long Range (-1 Skill Die)");
                }
            }
        }
        // ---------------------------

        // Apply Modifiers
        if (isMelee) {
            this._applyMeleeModifiers(form, strValue, mods);

            // --- DEFENSE MODIFIERS (Melee) ---
            if (mods.combatDef > 0) {
                mods.allDice -= mods.combatDef;
                notes.push(`Defended (Combat Def: -${mods.combatDef})`);
            }
            if (mods.acroDef > 0) {
                const pen = mods.acroDef * 2;
                mods.allDice -= pen;
                notes.push(`Defended (Acrobatics: -${pen})`);
            }
            if (mods.targetProne) {
                mods.successDie += 2;
                notes.push(`Target Prone (+2 SD)`);
            }
            // ---------------------------------

            // --- NEW VALIDATION: CLAMP RESERVED DICE ---
            if (mods.reservedDice > rank) {
                ui.notifications.warn(`Cannot reserve more dice (${mods.reservedDice}) than Skill Rank (${rank}). Reduced to ${rank}.`);
                mods.reservedDice = rank;
            }
            if (mods.reservedDice > 0) {
                notes.push(`Reserved ${mods.reservedDice} Dice.`);
            }
            // -------------------------------------------

        } else {
            // Check for false return to stop execution
            const canFire = await this._applyRangedModifiers(item, form, mods, notes, flags);
            if (canFire === false) return;
        }

        const penalty = this.actor.system.wounds.penalty || 0;
        mods.allDice -= penalty;

        // 4. ROLL
        // FIX: Base Modifier should NOT include Success Die specific modifiers (Aim, Prone Target)
        // Those are passed separately to calculateRollResult
        const baseModifier = statValue + rank + mods.allDice;

        // 5. CALCULATE SUCCESS
        let skillDiceCount = rank + 1 + (mods.rank || 0) - (mods.reservedDice || 0) - (mods.aimAuto || 0);
        if (skillDiceCount < 0) skillDiceCount = 0;

        const rollFormula = `1d10 + ${skillDiceCount}d10`;
        let roll = createSLARoll(rollFormula);
        await roll.evaluate();

        // We pass the final Base Mod and Success Die Mod
        const result = calculateRollResult(roll, baseModifier, undefined, {
            autoSkillSuccesses: mods.aimAuto || 0,
            successDieModifier: mods.successDie // Pass explicit SD mod
        });

        // --- ROF REROLL LOGIC (Burst / Auto) ---
        // "May reroll...". We interpret this as "Keep Highest" for user convenience.
        console.log("SLA | ROF Check - Flags:", flags);
        console.log("SLA | Initial Roll Terms:", roll.terms);

        // We track which dice were rerolled to prevent Luck abuse.
        let rofRerollSD = false;
        let rofRerollSkills = [];

        // Helper: Reroll a single result and keep highest
        const rerollDieKeepHighest = async (currentResult) => {
            const newRoll = createSLARoll("1d10");
            await newRoll.evaluate();
            const newRes = newRoll.terms[0].results[0].result;
            if (newRes > currentResult) {
                return { result: newRes, rerolled: true };
            }
            return { result: currentResult, rerolled: false }; // Kept original
        };

        // 1. BURST (Reroll SD)
        if (flags.rerollSD || flags.rerollAll) {
            const sdTerm = roll.terms[0];
            const oldVal = sdTerm.results[0].result;
            const outcome = await rerollDieKeepHighest(oldVal);

            // Mark as used regardless of outcome to prevent Luck abuse
            rofRerollSD = true;

            if (outcome.rerolled) {
                console.log(`SLA | Rerolling SD. Old: ${oldVal}, New: ${outcome.result}`);
                sdTerm.results[0].result = outcome.result;
                notes.push(`<strong>ROF:</strong> Success Die Improved (${oldVal} ➔ ${outcome.result})`);
            } else {
                console.log(`SLA | SD Kept (Old: ${oldVal} >= New: ${outcome.result})`);
                notes.push(`<strong>ROF:</strong> Success Die Kept (${oldVal})`);
            }
        }

        // 2. FULL AUTO / SUPPRESSIVE (Reroll All)
        if (flags.rerollAll && roll.terms.length > 2) {
            const skillTerm = roll.terms[2];
            let improvedCount = 0;

            for (let i = 0; i < skillTerm.results.length; i++) {
                const oldVal = skillTerm.results[i].result;
                const outcome = await rerollDieKeepHighest(oldVal);

                // Track usage for every die
                rofRerollSkills.push(i);

                if (outcome.rerolled) {
                    skillTerm.results[i].result = outcome.result;
                    improvedCount++;
                }
            }

            if (improvedCount > 0) {
                notes.push(`<strong>ROF:</strong> ${improvedCount} Skill Dice Improved.`);
            } else {
                notes.push(`<strong>ROF:</strong> Skill Dice Kept.`);
            }
        }

        // Re-evaluate total if changed
        if (rofRerollSD || rofRerollSkills.length > 0) {
            // Re-sum total manually as safe fallback or force re-eval
            roll._total = roll._evaluateTotal();
        }
        // ---------------------------------------

        // 5. RESULTS
        // 5. RESULTS
        const TN = 10;
        const sdRaw = roll.terms[0].results[0].result;
        // FIX: Display total correctly
        const sdTotal = sdRaw + baseModifier + mods.successDie;

        // Initial Success Check
        let isSuccess = sdTotal >= TN;
        // Logic will be cleaner if I calculate isSuccess first, then override.

        // MOS Calculation
        let skillDiceData = [];
        let skillSuccessCount = 0;

        if (roll.terms.length > 2) {
            roll.terms[2].results.forEach((r, i) => { // Added index 'i'
                let val = r.result + baseModifier;
                let isHit = val >= TN;
                if (isHit) skillSuccessCount++;

                // Track if this specific die was rerolled
                const isReroll = rofRerollSkills.includes(i);

                skillDiceData.push({
                    raw: r.result,
                    total: val,
                    borderColor: isHit ? "#39ff14" : "#555",
                    textColor: isHit ? "#39ff14" : "#ccc",
                    isReroll: isReroll // Pass flag
                });
            });
        }
        skillSuccessCount += mods.autoSkillSuccesses;
        for (let i = 0; i < mods.autoSkillSuccesses; i++) {
            skillDiceData.push({ raw: "-", total: "Auto", borderColor: "#39ff14", textColor: "#39ff14" });
        }

        // --- SUCCESS THROUGH EXPERIENCE ---
        // Rule: If 4+ Skill Dice hit, it's a success even if SD failed.
        // Treat as if only SD succeeded (MOS=0 / Standard Hit).
        let successThroughExperience = false;
        if (!isSuccess && skillSuccessCount >= 4) {
            isSuccess = true;
            successThroughExperience = true;
            notes.push("<strong>Success Through Experience</strong> (4+ Skill Dice hit).");
        }

        // Update Result Color if it became a success
        const resultColor = isSuccess ? '#39ff14' : '#f55';


        // --- NEW MOS LOGIC ---
        let mosDamageBonus = 0;
        let mosEffectText = isSuccess ? "Standard Hit" : "Failed";
        let mosChoiceData = { hasChoice: false, choiceType: "", choiceDmg: 0 };

        if (isSuccess && !successThroughExperience) {
            // Normal MOS Logic
            if (skillSuccessCount === 1) {
                mosDamageBonus = 1;
                mosEffectText = "+1 Damage";
            }
            else if (skillSuccessCount === 2) {
                // CHOICE: Wound (Arm) OR +2 Dmg
                mosEffectText = "MOS 2: Choose Effect";
                mosChoiceData = { hasChoice: true, choiceType: "arm", choiceDmg: 2 };
            }
            else if (skillSuccessCount === 3) {
                // CHOICE: Wound (Leg) OR +4 Dmg
                mosEffectText = "MOS 3: Choose Effect";
                mosChoiceData = { hasChoice: true, choiceType: "leg", choiceDmg: 4 };
            }
            else if (skillSuccessCount >= 4) {
                mosDamageBonus = 6;
                mosEffectText = "<strong style='color:#ff5555'>HEAD SHOT</strong> (+6 DMG)";
                
                // AUTO-APPLY HEAD WOUND ON HEAD SHOT
                if (game.user.targets.size > 0) {
                    const target = game.user.targets.first();
                    const targetActor = target?.actor;
                    if (targetActor && !targetActor.system.wounds.head) {
                        await targetActor.update({ "system.wounds.head": true });
                        notes.push(`<span style="color:#ff5555">Head Wound Applied!</span>`);
                    }
                }
            }
        }

        // Damage Calculation
        // Note: If user has a choice, we DO NOT add the bonus yet. They must click the button.
        let rawBase = item.system.damage || item.system.dmg || "0";
        let baseDmg = String(rawBase);
        let totalMod = mods.damage + mosDamageBonus;

        let finalDmgFormula = baseDmg;
        if (totalMod !== 0) {
            if (baseDmg === "0" || baseDmg === "") finalDmgFormula = String(totalMod);
            else finalDmgFormula = `${baseDmg} ${totalMod > 0 ? "+" : ""} ${totalMod}`;
        }

        let showButton = isSuccess && (finalDmgFormula && finalDmgFormula !== "0");

        // 1. CAPTURE AD VALUE (Ensure it's a number)
        const adValue = Number(item.system.ad) || 0;

        // Render
        const templateData = {
            actorUuid: this.actor.uuid,
            borderColor: resultColor,
            headerColor: resultColor,
            resultColor: resultColor,
            itemName: item.name.toUpperCase(),
            successTotal: sdTotal,
            tooltip: this._generateTooltip(roll, baseModifier, mods.successDie),
            skillDice: skillDiceData,
            notes: notes.join(" "),
            showDamageButton: showButton,
            dmgFormula: finalDmgFormula,
            minDamage: Number(item.system.minDamage) || 0,

            adValue: adValue, // <--- CRITICAL FIX: Pass AD to template

            // Pass ROF flags to template for styling
            sdIsReroll: rofRerollSD,

            mos: {
                isSuccess: isSuccess,
                hits: skillSuccessCount,
                effect: mosEffectText,
                ...mosChoiceData
            },
            // Luck Data
            canUseLuck: this.actor.system.stats.luck.value > 0,
            luckValue: this.actor.system.stats.luck.value,
            luckSpent: false,
            isWeapon: true // Pass isWeapon to template
        };

        const chatContent = await foundry.applications.handlebars.renderTemplate("systems/sla-industries/templates/chat/chat-weapon-rolls.hbs", templateData);

        roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: chatContent,
            flags: {
                sla: {
                    baseModifier: baseModifier,
                    itemName: item.name.toUpperCase(),
                    rofRerollSD: rofRerollSD,
                    rofRerollSkills: rofRerollSkills,
                    targets: Array.from(game.user.targets).map(t => t.document.uuid),
                    // Damage Context for Luck Reroll
                    damageBase: baseDmg,
                    damageMod: mods.damage,
                    adValue: adValue,
                    autoSkillSuccesses: mods.autoSkillSuccesses,
                    // NEW FLAGS for Recalculation
                    successDieModifier: mods.successDie,
                    isWeapon: true
                }
            }
        });
    }

    // --- EXPLOSIVE LOGIC ---
    async _renderExplosiveDialog(item) {
        // Prepare Template Data (Simplified for Explosives)
        const templateData = {
            item: item,
            isMelee: false, // It's ranged/thrown usually
            validModes: { "single": { label: "Single", active: true, rounds: 1, recoil: 0 } }, // Dummy structure
            selectedMode: "single",
            recoil: 0
        };

        const content = await foundry.applications.handlebars.renderTemplate("systems/sla-industries/templates/dialogs/attack-dialog.hbs", templateData);

        new Dialog({
            title: `Throw: ${item.name}`,
            content: content,
            buttons: {
                roll: {
                    label: "THROW",
                    callback: (html) => this._processExplosiveRoll(item, html)
                }
            },
            default: "roll"
        }, {
            classes: ["sla-dialog-window", "dialog"]
        }).render(true);
    }

    async _processExplosiveRoll(item, html) {
        const form = html[0].querySelector("form");
        if (!form) return;

        // 1. EXTRACT FORM DATA (Before closing dialog)
        const rollData = {
            mod: Number(form.modifier?.value) || 0,
            cover: Number(form.cover?.value) || 0,
            aiming: form.aiming?.value || "none",
            blind: form.blind?.checked || false
        };

        // 2. DETERMINE BLAST RADIUS for Template
        const innerDist = item.system.blastRadiusInner || 0;
        let outerDist = item.system.blastRadiusOuter || 0;
        if (outerDist === 0) outerDist = 5; // Default fallback

        // 3. START AIMING WORKFLOW
        // We hide the dialog but don't strictly close it? Actually, standard is to let the callback finish then close.

        // Notify
        ui.notifications.info("Select target position...");

        // Use a simple crosshair picker if we don't want to re-implement full Template Preview
        // But the user asked for "blast radius template centered on where..."
        // Ideally we show the template while aiming.

        // We'll calculate the pixel distance for the radius, but purely for visualization if we implemented it.
        // const pixelDist = (outerDist / canvas.scene.grid.distance) * canvas.scene.grid.size;

        // Simple Handler
        const target = await this._waitForCanvasClick();
        if (!target) return; // Cancelled

        // 4. RESOLVE
        await this._resolveExplosiveRoll(item, rollData, target, outerDist, innerDist);
    }

    _waitForCanvasClick() {
        return new Promise((resolve) => {
            const handler = (event) => {
                event.stopPropagation();
                // Get world coords
                const pos = event.data.getLocalPosition(canvas.app.stage);
                canvas.app.stage.off('click', handler);
                resolve({ x: pos.x, y: pos.y });
            };
            canvas.app.stage.on('click', handler);

            // Allow cancelling with Right Click
            const cancelHandler = (event) => {
                canvas.app.stage.off('click', handler);
                canvas.app.stage.off('rightdown', cancelHandler);
                resolve(null);
            };
            canvas.app.stage.on('rightdown', cancelHandler);
        });
    }

    async _resolveExplosiveRoll(item, rollData, target, blastRadius, innerDist) {
        // 1. CONSUME QUANTITY
        const currentQty = item.system.quantity || 0;
        if (currentQty <= 0) {
            return ui.notifications.warn(`You are out of ${item.name}s.`);
        }

        const newQty = currentQty - 1;
        if (newQty === 0) {
            await item.delete();
        } else {
            await item.update({ "system.quantity": newQty });
        }

        // 2. SETUP STATS
        const skillName = item.system.skill || "throw";

        // Basic lookup same as weapon
        const combatSkills = CONFIG.SLA?.combatSkills || {};
        let targetSkillName = skillName;
        if (combatSkills[skillName]) targetSkillName = combatSkills[skillName];
        else if (skillName) targetSkillName = skillName;

        // Find skill rank
        let rank = 0;
        let skillItemForStat = null;

        if (targetSkillName) {
            const skillItem = this.actor.items.find(i => i.type === 'skill' && i.name.trim().toLowerCase() === targetSkillName.trim().toLowerCase());
            if (skillItem) {
                rank = Number(skillItem.system.rank) || 0;
                skillItemForStat = skillItem;
            }
        }

        const statKey = skillItemForStat?.system?.stat || "dex";
        const statValue = this.actor.system.stats[statKey]?.total ?? this.actor.system.stats[statKey]?.value ?? 0;
        const strValue = this.actor.system.stats.str?.total ?? this.actor.system.stats.str?.value ?? 0;

        // 3. READ MODIFIERS
        let mods = {
            successDie: 0,
            allDice: rollData.mod,
            rank: 0,
            damage: 0,
            autoSkillSuccesses: 0
        };
        let notes = [];
        if (item.system.blastRadiusInner || item.system.blastRadiusOuter) {
            const txt = item.system.blastRadiusInner > 0
                ? `${item.system.blastRadiusInner}/${item.system.blastRadiusOuter}m`
                : `${item.system.blastRadiusOuter}m`;
            notes.push(`<strong>Blast:</strong> ${txt}`);
        }

        // RANGE CALCULATION & VALIDATION
        const effectiveRange = 15 + (Math.min(Math.max(0, strValue), 5) * 5);
        notes.push(`<strong>Max Range:</strong> ${effectiveRange}m`);

        // Check Distance to Target from Token
        // Fix: this.token is a Document, not a Placeable. Use canvas token.
        const token = this.token?.object ?? this.actor.getActiveTokens()[0];

        if (token) {
            const ray = new foundry.canvas.geometry.Ray(token.center, target);
            const distMeters = (ray.distance / canvas.scene.grid.size) * canvas.scene.grid.distance;

            if (distMeters > effectiveRange) {
                notes.push(`<strong style='color:#ffa500'>OUT OF RANGE (${Math.round(distMeters)}m)</strong>`);
                // Apply Range Penalty? Rules say "Normal modifiers for long range are applied"
                // For now just warn
            }
        }

        // Global Conditions
        if (this.actor.system.conditions?.prone) mods.allDice -= 1;
        if (this.actor.system.conditions?.stunned) mods.allDice -= 1;
        const penalty = this.actor.system.wounds.penalty || 0;
        mods.allDice -= penalty;

        // Form Inputs
        mods.successDie += rollData.cover;

        if (rollData.aiming === "sd") mods.successDie += 1;
        if (rollData.aiming === "skill") mods.autoSkillSuccesses += 1;

        // 4. ROLL
        const baseModifier = statValue + rank + mods.allDice;
        const skillDiceCount = Math.max(0, rank + 1 + mods.rank);

        const rollFormula = `1d10 + ${skillDiceCount}d10`;
        let roll = createSLARoll(rollFormula);
        await roll.evaluate();

        // 5. RESULTS AND DEVIATION
        const TN = 10; // All ranged attacks (including thrown explosives) use TN 10
        const sdRaw = roll.terms[0].results[0].result;
        const sdTotal = sdRaw + baseModifier + mods.successDie;
        let isBaseSuccess = sdTotal >= TN;

        // Count Skill Dice Hits
        let skillSuccessCount = 0;
        let skillDiceData = [];

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
        skillSuccessCount += mods.autoSkillSuccesses;

        // --- DEVIATION LOGIC ---
        let outcomeText = "";
        let resultColor = "#f55";
        let isSuccess = false;

        let finalX = target.x;
        let finalY = target.y;

        const allDiceFailed = (!isBaseSuccess) && (skillSuccessCount === 0);

        if (allDiceFailed) {
            // FUMBLE: Detonates on location!
            outcomeText = "<strong style='color:#ff0000; font-size:1.1em;'>FUMBLE: Detonates on Thrower!</strong>";
            resultColor = "#ff0000";

            if (token) {
                finalX = token.center.x;
                finalY = token.center.y;
            }
        }
        else if (isBaseSuccess && skillSuccessCount > 0) {
            // HIT
            outcomeText = "<strong style='color:#39ff14'>LANDS ON TARGET</strong>";
            resultColor = "#39ff14";
            isSuccess = true;
        }
        else if (isBaseSuccess && skillSuccessCount === 0) {
            // DEVIATION 5m
            outcomeText = "<strong style='color:#ffa500'>DEVIATION: 5m</strong>";
            resultColor = "#ffa500";

            const devPixels = (5 / canvas.scene.grid.distance) * canvas.scene.grid.size;
            const angle = Math.random() * 2 * Math.PI;
            finalX += Math.cos(angle) * devPixels;
            finalY += Math.sin(angle) * devPixels;
        }
        else {
            // DEVIATION 10m
            outcomeText = "<strong style='color:#ff5555'>DEVIATION: 10m</strong>";
            resultColor = "#ff5555";

            const devPixels = (10 / canvas.scene.grid.distance) * canvas.scene.grid.size;
            const angle = Math.random() * 2 * Math.PI;
            finalX += Math.cos(angle) * devPixels;
            finalY += Math.sin(angle) * devPixels;
        }

        // Add note about kill-zone
        if (innerDist > 0) {
            notes.push(`<br/><strong>Kill Zone (< ${innerDist}m):</strong> +2 Damage`);
        }

        // 6. PLACE TEMPLATE(S)
        try {
            const templates = [];

            // 1. Outer Template (Lighter)
            templates.push({
                t: "circle",
                user: game.user.id,
                x: finalX,
                y: finalY,
                distance: blastRadius, // Outer
                fillColor: game.user.color,
                // Make it lighter/transparent
                fillAlpha: 0.2,
                flags: { sla: { itemId: item.id, isDeviation: !isSuccess, type: "outer" } }
            });

            // 2. Inner Template (Darker / Kill Zone)
            if (innerDist > 0 && innerDist < blastRadius) {
                templates.push({
                    t: "circle",
                    user: game.user.id,
                    x: finalX,
                    y: finalY,
                    distance: innerDist, // Inner
                    fillColor: game.user.color, // Same color, just more opaque
                    fillAlpha: 0.6,
                    flags: { sla: { itemId: item.id, isDeviation: !isSuccess, type: "inner" } }
                });
            }

            // Create the template(s)
            canvas.scene.createEmbeddedDocuments("MeasuredTemplate", templates);

        } catch (err) {
            console.error("SLA | Template Creation Failed:", err);
        }

        // Damage
        let baseDmg = item.system.damage || "0";
        const adValue = Number(item.system.ad) || 0;

        // Render Template Data
        const templateData = {
            actorUuid: this.actor.uuid,
            borderColor: resultColor,
            headerColor: resultColor,
            resultColor: resultColor,
            itemName: item.name.toUpperCase(),
            successTotal: sdTotal,
            tooltip: this._generateTooltip(roll, baseModifier, mods.successDie),
            skillDice: skillDiceData,
            notes: notes.join(" "),
            showDamageButton: true,
            dmgFormula: baseDmg,
            minDamage: Number(item.system.minDamage) || 0,
            adValue: adValue,
            mos: {
                isSuccess: isSuccess,
                hits: skillSuccessCount,
                effect: outcomeText
            },
            canUseLuck: this.actor.system.stats.luck.value > 0,
            luckValue: this.actor.system.stats.luck.value,
            isEbb: true // Pass isEbb to template for conditional logic
        };

        const chatContent = await foundry.applications.handlebars.renderTemplate("systems/sla-industries/templates/chat/chat-weapon-rolls.hbs", templateData);

        roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: chatContent,
            flags: {
                sla: {
                    baseModifier: baseModifier,
                    itemName: item.name.toUpperCase(),
                    targets: Array.from(game.user.targets).map(t => t.document.uuid),
                    damageBase: baseDmg,
                    adValue: adValue
                }
            }
        });
    }

    async _executeEbbRoll(item) {
        const formulaRating = item.system.formulaRating || 7;
        const currentFlux = this.actor.system.stats.flux?.value || 0;
        const fluxCost = 1; // Most formulas cost 1 Flux

        // 1. Check & Consume Flux
        if (currentFlux < fluxCost) {
            ui.notifications.error("Insufficient FLUX.");
            return;
        }
        await this.actor.update({ "system.stats.flux.value": Math.max(0, currentFlux - fluxCost) });

        // 2. Resolve Discipline Rank
        // We need to find the parent Discipline to get the Rank
        const disciplineName = item.system.discipline;
        const statKey = "conc"; // Ebb is usually Concentration based
        const statValue = this.actor.system.stats[statKey]?.total ?? this.actor.system.stats[statKey]?.value ?? 0;

        let targetName = disciplineName;
        // Handle short names vs full names if you have a config map
        const ebbDisciplines = CONFIG.SLA?.ebbDisciplines || {};
        for (const [key, label] of Object.entries(ebbDisciplines)) {
            if (key === disciplineName || label === disciplineName) { targetName = label; break; }
        }

        const disciplineItem = this.actor.items.find(i => i.type === 'discipline' && i.name.toLowerCase() === targetName.toLowerCase());
        if (!disciplineItem) {
            ui.notifications.warn(`Missing Discipline Item: ${targetName}`);
            return;
        }

        const rank = Number(disciplineItem.system.rank) || 0;

        // 3. Modifiers
        let globalMod = 0;
        if (this.actor.system.conditions?.prone) globalMod -= 1;
        if (this.actor.system.conditions?.stunned) globalMod -= 1;
        const penalty = this.actor.system.wounds.penalty || 0;

        const modifier = statValue + rank - penalty + globalMod;

        // 4. Roll Formula: 1d10 + (Rank + 1)d10
        const skillDiceCount = rank + 1;
        const rollFormula = `1d10 + ${skillDiceCount}d10`;

        let roll = new Roll(rollFormula);
        // --- DICE SO NICE: FORCE BLACK SUCCESS DIE ---
        // Target the first term (1d10)
        if (roll.terms.length > 0 && roll.terms[0].constructor.name === "Die") {
            roll.terms[0].options.appearance = {
                foreground: "#FFFFFF", // White Text
                background: "#000000", // Black Body
                edge: "#333333"        // Dark Grey Outline
            };
        }
        // ---------------------------------------------
        await roll.evaluate();

        // 5. Calculate Success (Target Number is the Formula Rating)
        const successRaw = roll.terms[0].results[0].result;
        const successTotal = successRaw + modifier;
        const isBaseSuccess = successTotal >= formulaRating;
        const resultColor = isBaseSuccess ? '#39ff14' : '#f55';

        // 6. Process Skill/Flux Dice
        let skillDiceData = [];
        let skillSuccesses = 0;

        if (roll.terms.length > 2) {
            roll.terms[2].results.forEach(r => {
                let val = r.result + modifier;
                // For Ebb, the TN for skill dice is ALSO the Formula Rating
                let isHit = val >= formulaRating;
                if (isHit) skillSuccesses++;

                skillDiceData.push({
                    raw: r.result,
                    total: val,
                    borderColor: isHit ? "#39ff14" : "#555",
                    textColor: isHit ? "#39ff14" : "#ccc"
                });
            });
        }

        // 7. Determine MOS Effects (Specific to Ebb)
        let mosEffectText = "Standard Success";
        let failureConsequence = "Failed";

        const allDiceFailed = (!isBaseSuccess) && (skillSuccesses === 0);
        const isSuccessful = isBaseSuccess || (skillSuccesses >= 1); // Ebb succeeds if EITHER success die OR skill dice hit

        if (isSuccessful) {
            if (skillSuccesses === 2) mosEffectText = "+1 Damage / Effect";
            else if (skillSuccesses === 3) mosEffectText = "+2 Damage / Repeat Ability";
            else if (skillSuccesses >= 4) mosEffectText = "<strong style='color:#39ff14'>CRITICAL:</strong> +4 Dmg | Regain 1 FLUX";
        } else {
            if (allDiceFailed) {
                failureConsequence = "<strong style='color:#ff5555'>SEVERE FAILURE:</strong> -3 HP & -1 Extra FLUX";
                // Auto-apply punishment? Or just warn?
                // await this.actor.update({ 
                //    "system.hp.value": Math.max(0, this.actor.system.hp.value - 3),
                //    "system.stats.flux.value": Math.max(0, this.actor.system.stats.flux.value - 1)
                // });
            }
        }

        // 8. Damage Calculation (For Offensive Formulas)
        let rawBase = item.system.dmg || item.system.damage || "0";
        let baseDmg = String(rawBase);
        let mosDamageBonus = 0;

        // Map MOS to damage if applicable
        if (isSuccessful) {
            if (skillSuccesses === 2) mosDamageBonus = 1;
            if (skillSuccesses === 3) mosDamageBonus = 2;
            if (skillSuccesses >= 4) mosDamageBonus = 4;
        }

        let finalDmgFormula = baseDmg;
        if (baseDmg !== "0" && baseDmg !== "") {
            let sign = mosDamageBonus > 0 ? "+" : "";
            if (mosDamageBonus > 0) finalDmgFormula = `${baseDmg} ${sign} ${mosDamageBonus}`;
        }

        // Show damage button if formula exists AND not "0"
        let showButton = isSuccessful && (finalDmgFormula && finalDmgFormula !== "0");

        // 9. Render Template
        const templateData = {
            borderColor: resultColor,
            headerColor: resultColor,
            resultColor: resultColor,
            actorUuid: this.actor.uuid,
            itemName: item.name.toUpperCase(),
            successTotal: successTotal,
            tooltip: this._generateTooltip(roll, modifier, 0),
            skillDice: skillDiceData,
            notes: `<strong>Formula Rating:</strong> ${formulaRating}`,
            showDamageButton: showButton,
            dmgFormula: finalDmgFormula,
            adValue: item.system.ad || 0,
            mos: {
                isSuccess: isSuccessful,
                hits: skillSuccesses,
                effect: isSuccessful ? mosEffectText : failureConsequence
            },
            isEbb: true // Pass isEbb
        };

        const chatContent = await foundry.applications.handlebars.renderTemplate("systems/sla-industries/templates/chat/chat-weapon-rolls.hbs", templateData);

        roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: chatContent,
            flags: {
                sla: {
                    baseModifier: modifier,
                    itemName: item.name.toUpperCase(),
                    isWeapon: false,
                    isEbb: true // Flag as Ebb
                }
            }
        });
    }

    // --- DROP ITEM HANDLER ---
    async _onDropItem(event, data) {
        if (!this.actor.isOwner) return false;
        const item = await Item.implementation.fromDropData(data);
        const itemData = item.toObject();

        // Helper: Handle Skill Array
        const processSkills = async (skillsArray, sourceFlag) => {
            if (!skillsArray || !Array.isArray(skillsArray) || skillsArray.length === 0) return;

            const toCreate = [];
            const toUpdate = [];

            for (const skillData of skillsArray) {
                // 1. Safety check: skip if data is missing
                if (!skillData || !skillData.name) continue;

                const existing = this.actor.items.find(i => i.name.toLowerCase() === skillData.name.toLowerCase() && i.type === "skill");

                if (existing) {
                    // Update Existing Skill Rank
                    const currentRank = existing.system?.rank || 0;
                    toUpdate.push({ _id: existing.id, "system.rank": currentRank + 1 });
                    ui.notifications.info(`Upgraded ${existing.name} to Rank ${currentRank + 1}`);
                } else {
                    // 2. Prepare New Skill Object
                    // We create a FRESH object to guarantee structure, rather than just cloning
                    const newSkill = {
                        name: skillData.name,
                        type: "skill", // <--- CRITICAL FIX: Explicitly set the type
                        img: skillData.img || "icons/svg/book.svg",
                        system: {
                            rank: 1, // Default to rank 1
                            // FIX: Lookup stat from config first (to override legacy "dex" in compendium items)
                            stat: CONFIG.SLA?.skillStats?.[skillData.name.toLowerCase()]
                                || skillData.stat
                                || skillData.system?.stat
                                || "dex",
                            description: skillData.system?.description || ""
                        },
                        flags: {
                            "sla-industries": {
                                [sourceFlag]: true
                            }
                        }
                    };

                    toCreate.push(newSkill);
                }
            }

            if (toCreate.length > 0) {
                console.log("Creating Skills:", toCreate); // Debug log to verify data
                await this.actor.createEmbeddedDocuments("Item", toCreate);
            }
            if (toUpdate.length > 0) {
                await this.actor.updateEmbeddedDocuments("Item", toUpdate);
            }
        };

        // 1. DROP SPECIES
        if (itemData.type === "species") {
            const existing = this.actor.items.find(i => i.type === "species");
            if (existing) {
                // CLEANUP: Delete old skills associated with the previous species
                const oldSkills = this.actor.items.filter(i => i.getFlag("sla-industries", "fromSpecies"));
                const idsToDelete = [existing.id, ...oldSkills.map(i => i.id)];

                await this.actor.deleteEmbeddedDocuments("Item", idsToDelete);
            }

            await this.actor.createEmbeddedDocuments("Item", [itemData]);
            await this.actor.update({ "system.bio.species": itemData.name });

            // Update Stats
            if (itemData.system.stats) {
                const updates = {};
                for (const [key, val] of Object.entries(itemData.system.stats)) {
                    const valueToSet = (typeof val === 'object' && val.min !== undefined) ? val.min : val;
                    updates[`system.stats.${key}.value`] = valueToSet;
                }
                await this.actor.update(updates);
            }

            // Process Skills
            await processSkills(itemData.system.skills, "fromSpecies");
            return;
        }

        // 2. DROP PACKAGE
        if (itemData.type === "package") {
            const reqs = itemData.system.requirements || {};
            // Validate Requirements
            for (const [key, minVal] of Object.entries(reqs)) {
                const actorStat = this.actor.system.stats[key]?.value || 0;
                if (actorStat < minVal) {
                    ui.notifications.error(`Requirement not met: ${key.toUpperCase()} must be ${minVal}+`);
                    return;
                }
            }

            const existing = this.actor.items.find(i => i.type === "package");
            if (existing) {
                // CLEANUP: Delete old skills associated with the previous package
                const oldSkills = this.actor.items.filter(i => i.getFlag("sla-industries", "fromPackage"));
                const idsToDelete = [existing.id, ...oldSkills.map(i => i.id)];

                await this.actor.deleteEmbeddedDocuments("Item", idsToDelete);
            }

            await this.actor.createEmbeddedDocuments("Item", [itemData]);
            await this.actor.update({ "system.bio.package": itemData.name });

            await processSkills(itemData.system.skills, "fromPackage");
            return;
        }

        // 3. AUTO-EQUIP FOR NPCs (Armor/Weapons)
        // NPCs lack an "Active" toggle on their sheet, so items must default to equipped.
        if (this.actor.type === "npc" && ["weapon", "armor"].includes(itemData.type)) {
            foundry.utils.setProperty(itemData, "system.equipped", true);
            return this.actor.createEmbeddedDocuments("Item", [itemData]);
        }

        // Default Drop Handler
        return super._onDropItem(event, data);
    }

    async _onItemCreate(event) {
        event.preventDefault();
        const header = event.currentTarget;
        const type = header.dataset.type;
        const name = `New ${type.capitalize()}`;
        const itemData = { name: name, type: type };
        return await Item.create(itemData, { parent: this.actor });
    }

    // --- HELPER: MELEE LOGIC ---
    _applyMeleeModifiers(form, strValue, mods) {
        applyMeleeModifiers(form, strValue, mods);
    }

    // --- HELPER: RANGED LOGIC ---
    async _applyRangedModifiers(item, form, mods, notes, flags) {
        return await applyRangedModifiers(item, form, mods, notes, flags);
    }

    // --- HELPERS: HTML GENERATION ---
    _generateTooltip(roll, baseModifier, successDieMod) {
        let html = `<div class="dice-tooltip" style="display:none; margin-top:10px; padding-top:5px; border-top:1px solid #444; font-size:0.8em; color:#ccc;">`;

        // Safety check for terms
        if (!roll.terms || roll.terms.length === 0) return "";

        const sdRaw = roll.terms[0].results[0]?.result || 0;
        const sdTotal = sdRaw + baseModifier + successDieMod;

        html += `<div><strong>Success Die:</strong> Raw ${sdRaw} + Base ${baseModifier} + SD Mod ${successDieMod} = <strong>${sdTotal}</strong></div>`;

        if (roll.terms.length > 2) {
            html += `<div style="border-top:1px dashed #444; margin-top:2px;"><strong>Skill Dice (Base ${baseModifier}):</strong></div>`;
            html += `<div style="display:flex; flex-wrap:wrap; gap:5px; margin-top:2px;">`;

            // Iterate over Skill Dice results
            roll.terms[2].results.forEach(r => {
                html += `<span style="background:#222; border:1px solid #555; padding:1px 4px;">${r.result} + ${baseModifier} = <strong>${r.result + baseModifier}</strong></span>`;
            });
            html += `</div>`;
        }
        html += `</div>`;
        return html;
    }
}