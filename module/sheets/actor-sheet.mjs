/**
 * Extend the basic ActorSheet
 * @extends {ActorSheet}
 */
import { LuckDialog } from "../apps/luck-dialog.mjs";
import { XPDialog } from "../apps/xp-dialog.mjs";
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
        if (this.actor.type === 'vehicle') return `${path}/actor-vehicle-sheet.hbs`;
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

        if (this.actor.type == 'character' || this.actor.type == 'npc' || this.actor.type == 'vehicle') {
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
            const field = target.name;
            const isChecked = target.checked;

            // Update the actor - Foundry's default form handling might not work reliably for nested properties
            const updateData = { [field]: isChecked };
            
            try {
                // Update the actor. The _onUpdate method in Actor.mjs will handle
                // the side effects (Bleeding, Stunned, Immobile) automatically.
                await this.actor.update(updateData);
            } catch (error) {
                console.error("SLA Industries | Error updating actor:", error);
                // Revert checkbox on error
                target.checked = !isChecked;
            }
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

        // --- XP BUTTON ---
        html.find('.xp-button').click(async ev => {
            ev.preventDefault();
            await XPDialog.create(this.actor);
        });

        if (this.actor.type === "vehicle") {
            const vehicleWeaponDropZone = html.find(".vehicle-weapon-drop");
            if (vehicleWeaponDropZone.length > 0) {
                vehicleWeaponDropZone.on("dragover", event => event.preventDefault());
                vehicleWeaponDropZone.on("drop", this._onDropVehicleWeapon.bind(this));
            }
        }
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
        const magazineDepleted = newQty <= 0;

        if (magazineDepleted) {
            await magazine.delete();
        } else {
            await magazine.update({ "system.quantity": newQty });
        }

        // 4. Post Chat Message
        const templateData = {
            weaponName: weapon.name.toUpperCase(),
            actorName: this.actor.name,
            magazineName: magazine.name,
            ammoLoaded: capacity,
            magazineDepleted: magazineDepleted,
            magazinesRemaining: newQty
        };

        const content = await foundry.applications.handlebars.renderTemplate(
            "systems/sla-industries/templates/chat/reload.hbs",
            templateData
        );

        ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: content
        });
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
                if (!this._canProceedWithWeaponAttack(item, { requireTarget: true })) return;

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
            const finalMod = statValue - (game.settings.get("sla-industries", "enableAutomaticWoundPenalties") ? penalty : 0) + globalMod;

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
                    sla: this._buildSlaRollFlags({
                        baseModifier: finalMod,
                        itemName: `${statLabel} CHECK`,
                        notes: "",
                        tn: 10
                    })
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

    /**
     * PC sheets track equipped gear; Threat sheets do not expose an equip toggle (drops default to equipped).
     * @returns {boolean}
     */
    _requiresWeaponEquippedForAttack() {
        return this.actor.type === "character";
    }

    /** @returns {void} */
    _notifyUnequippedWeaponHumor() {
        const lines = [
            "That hardware is still stowed—you need it in hand, not in inventory. Equip it first, operative.",
            "You can't mug a Carrien with pocket lint. Equip the weapon, then we'll talk dice.",
            "Bane's watching, and even he expects the barrel to leave the holster before you roll. Equip it.",
            "Nice commitment to the bit, but mime combat doesn't bypass armor. Toggle that weapon to equipped."
        ];
        ui.notifications.info(lines[Math.floor(Math.random() * lines.length)]);
    }

    /**
     * Centralized weapon attack gate checks used by dialog + roll execution.
     * @param {Item} item
     * @param {Object} options
     * @param {boolean} options.requireTarget
     * @returns {boolean}
     */
    _canProceedWithWeaponAttack(item, { requireTarget = false } = {}) {
        if (this._requiresWeaponEquippedForAttack() && !item.system.equipped) {
            this._notifyUnequippedWeaponHumor();
            return false;
        }

        if (requireTarget
            && game.settings.get("sla-industries", "enableTargetRequiredFeatures")
            && game.user.targets.size === 0) {
            ui.notifications.warn("You must select a target to attack.");
            return false;
        }

        return true;
    }

    _getActorTokenForRangeCheck() {
        return this.actor.token?.object || this.token || (this.actor.getActiveTokens().length > 0 ? this.actor.getActiveTokens()[0] : null);
    }

    _resolveRangedAttackContext(item, isMelee) {
        const context = { isLongRange: false, rangePenaltyMsg: "" };
        if (isMelee || !game.settings.get("sla-industries", "enableTargetRequiredFeatures") || game.user.targets.size === 0) {
            return context;
        }

        const token = this._getActorTokenForRangeCheck();
        if (!token) return context;

        const target = game.user.targets.first();
        const maxRange = parseInt(item.system.range || "10") || 10;
        const rangeData = calculateRangePenalty(token, target, maxRange);

        context.isLongRange = rangeData.isLongRange;
        context.rangePenaltyMsg = rangeData.penaltyMsg;
        return context;
    }

    // --- DIALOG ---
    async _renderAttackDialog(item, isMelee) {
        if (!this._canProceedWithWeaponAttack(item, { requireTarget: true })) return;

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
        const { rangePenaltyMsg } = this._resolveRangedAttackContext(item, isMelee);
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

        const baseModifier = statValue + rank + globalMod - (game.settings.get("sla-industries", "enableAutomaticWoundPenalties") ? penalty : 0);

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
                sla: this._buildSlaRollFlags({
                    baseModifier: baseModifier,
                    itemName: item.name.toUpperCase(),
                    notes: "",
                    tn: 10,
                    extra: {
                        rofRerollSD: false,
                        rofRerollSkills: []
                    }
                })
            }
        });
    }

    // --- HELPERS: HTML GENERATION ---
    // Kept for legacy compatibility if other modules call it, but uses new helper internally
    _generateTooltip(roll, baseModifier, successDieMod) {
        return generateDiceTooltip(roll, baseModifier, 0, successDieMod);
    }

    _buildSlaRollFlags({ baseModifier, itemName, notes = "", tn = 10, extra = {} }) {
        return {
            baseModifier,
            itemName,
            notes,
            tn,
            ...extra
        };
    }

    _resolveCombatSkillRank(skillInput) {
        if (!skillInput) return 0;

        const combatSkills = CONFIG.SLA?.combatSkills || {};
        const resolvedSkillName = combatSkills[skillInput] || skillInput;
        const skillItem = this.actor.items.find(i =>
            i.type === "skill" && i.name.trim().toLowerCase() === resolvedSkillName.trim().toLowerCase()
        );
        return skillItem ? (Number(skillItem.system.rank) || 0) : 0;
    }

    _readWeaponRollFormState(form) {
        return {
            modifier: Number(form.modifier?.value) || 0,
            aimSd: Number(form.aim_sd?.value) || 0,
            aimAuto: Number(form.aim_auto?.value) || 0,
            combatDef: Number(form.combatDef?.value) || 0,
            acroDef: Number(form.acroDef?.value) || 0,
            targetProne: form.prone?.checked || false
        };
    }

    _buildWeaponRollMods(formState) {
        return {
            successDie: 0,
            allDice: formState.modifier,
            rank: 0,
            damage: 0,
            autoSkillSuccesses: 0,
            reservedDice: 0,
            aimSd: formState.aimSd,
            aimAuto: formState.aimAuto,
            combatDef: formState.combatDef,
            acroDef: formState.acroDef,
            targetProne: formState.targetProne
        };
    }

    _resolveWeaponMosOutcome({ isSuccess, successThroughExperience, skillSuccessCount }) {
        let mosDamageBonus = 0;
        let mosEffectText = isSuccess ? "Standard Hit" : "Failed";
        let mosChoiceData = { hasChoice: false, choiceType: "", choiceDmg: 0 };
        let shouldApplyHeadWound = false;

        if (isSuccess && !successThroughExperience) {
            if (skillSuccessCount === 1) {
                mosDamageBonus = 1;
                mosEffectText = "+1 Damage";
            }
            else if (skillSuccessCount === 2) {
                mosEffectText = "MOS 2: Choose Effect";
                mosChoiceData = { hasChoice: true, choiceType: "arm", choiceDmg: 2 };
            }
            else if (skillSuccessCount === 3) {
                mosEffectText = "MOS 3: Choose Effect";
                mosChoiceData = { hasChoice: true, choiceType: "leg", choiceDmg: 4 };
            }
            else if (skillSuccessCount >= 4) {
                mosDamageBonus = 6;
                mosEffectText = "<strong style='color:#ff5555'>HEAD SHOT</strong> (+6 DMG)";
                shouldApplyHeadWound = true;
            }
        }

        return { mosDamageBonus, mosEffectText, mosChoiceData, shouldApplyHeadWound };
    }

    async _applyHeadshotSideEffect(notes) {
        if (game.user.targets.size === 0) return;

        const target = game.user.targets.first();
        const targetActor = target?.actor;
        if (targetActor && !targetActor.system.wounds.head) {
            await targetActor.update({ "system.wounds.head": true });
            notes.push(`<span style="color:#ff5555">Head Wound Applied!</span>`);
        }
    }

    _buildWeaponDamageFormula(baseDamage, totalModifier) {
        let finalDamageFormula = baseDamage;
        if (totalModifier !== 0) {
            if (baseDamage === "0" || baseDamage === "") {
                finalDamageFormula = String(totalModifier);
            } else {
                finalDamageFormula = `${baseDamage} ${totalModifier > 0 ? "+" : ""} ${totalModifier}`;
            }
        }
        return finalDamageFormula;
    }

    _buildWeaponRollTemplateData({
        item,
        roll,
        baseModifier,
        notesText,
        successDieModifier,
        resultColor,
        sdTotal,
        skillDiceData,
        showDamageButton,
        finalDamageFormula,
        adValue,
        rofRerollSD,
        isSuccess,
        skillSuccessCount,
        mosEffectText,
        mosChoiceData
    }) {
        return {
            actorUuid: this.actor.uuid,
            borderColor: resultColor,
            headerColor: resultColor,
            resultColor: resultColor,
            itemName: item.name.toUpperCase(),
            successTotal: sdTotal,
            tooltip: this._generateTooltip(roll, baseModifier, successDieModifier),
            skillDice: skillDiceData,
            notes: notesText,
            showDamageButton: showDamageButton,
            dmgFormula: finalDamageFormula,
            minDamage: Number(item.system.minDamage) || 0,
            adValue: adValue,
            sdIsReroll: rofRerollSD,
            mos: {
                isSuccess: isSuccess,
                hits: skillSuccessCount,
                effect: mosEffectText,
                ...mosChoiceData
            },
            canUseLuck: this.actor.system.stats.luck.value > 0,
            luckValue: this.actor.system.stats.luck.value,
            luckSpent: false,
            isWeapon: true
        };
    }

    async _rerollDieKeepHighest(currentResult) {
        const newRoll = createSLARoll("1d10");
        await newRoll.evaluate();
        const newResult = newRoll.terms[0].results[0].result;
        if (newResult > currentResult) {
            return { result: newResult, rerolled: true };
        }
        return { result: currentResult, rerolled: false };
    }

    async _applyWeaponRofRerolls({ roll, flags, notes }) {
        let rofRerollSD = false;
        let rofRerollSkills = [];

        if (flags.rerollSD || flags.rerollAll) {
            const sdTerm = roll.terms[0];
            const oldValue = sdTerm.results[0].result;
            const outcome = await this._rerollDieKeepHighest(oldValue);

            rofRerollSD = true;
            if (outcome.rerolled) {
                sdTerm.results[0].result = outcome.result;
                notes.push(`<strong>ROF:</strong> Success Die Improved (${oldValue} ➔ ${outcome.result})`);
            } else {
                notes.push(`<strong>ROF:</strong> Success Die Kept (${oldValue})`);
            }
        }

        if (flags.rerollAll && roll.terms.length > 2) {
            const skillTerm = roll.terms[2];
            let improvedCount = 0;

            for (let i = 0; i < skillTerm.results.length; i++) {
                const oldValue = skillTerm.results[i].result;
                const outcome = await this._rerollDieKeepHighest(oldValue);
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

        if (rofRerollSD || rofRerollSkills.length > 0) {
            roll._total = roll._evaluateTotal();
        }

        return { rofRerollSD, rofRerollSkills };
    }

    _buildSkillDiceResults({
        roll,
        baseModifier,
        targetNumber,
        autoSuccesses = 0,
        rerollIndexes = [],
        includeRerollFlag = false
    }) {
        const rerollIndexSet = new Set(rerollIndexes);
        const skillDiceData = [];
        let skillSuccessCount = 0;

        if (roll.terms.length > 2) {
            roll.terms[2].results.forEach((result, index) => {
                const total = result.result + baseModifier;
                const isHit = total >= targetNumber;
                if (isHit) skillSuccessCount++;

                const dieData = {
                    raw: result.result,
                    total: total,
                    borderColor: isHit ? "#39ff14" : "#555",
                    textColor: isHit ? "#39ff14" : "#ccc"
                };
                if (includeRerollFlag) {
                    dieData.isReroll = rerollIndexSet.has(index);
                }
                skillDiceData.push(dieData);
            });
        }

        skillSuccessCount += autoSuccesses;
        for (let i = 0; i < autoSuccesses; i++) {
            skillDiceData.push({ raw: "-", total: "Auto", borderColor: "#39ff14", textColor: "#39ff14" });
        }

        return { skillDiceData, skillSuccessCount };
    }

    _computeSuccessDieOutcome({ roll, baseModifier, successDieModifier = 0, targetNumber }) {
        const sdRaw = roll.terms[0].results[0].result;
        const sdTotal = sdRaw + baseModifier + successDieModifier;
        const isBaseSuccess = sdTotal >= targetNumber;
        return { sdRaw, sdTotal, isBaseSuccess };
    }

    _applySuccessThroughExperience({ isBaseSuccess, skillSuccessCount, threshold = 4, notes }) {
        let isSuccess = isBaseSuccess;
        let successThroughExperience = false;

        if (!isBaseSuccess && skillSuccessCount >= threshold) {
            isSuccess = true;
            successThroughExperience = true;
            if (notes) {
                notes.push("<strong>Success Through Experience</strong> (4+ Skill Dice hit).");
            }
        }

        return { isSuccess, successThroughExperience };
    }

    async _processWeaponRoll(item, html, isMelee) {
        const form = html[0].querySelector("form");
        if (!form) return;

        const weapon = this.actor.items.get(item.id) ?? item;
        if (!this._canProceedWithWeaponAttack(weapon, { requireTarget: true })) return;
        item = weapon;

        // 1. SETUP
        // Melee weapons use STR, ranged weapons use DEX.
        const statKey = isMelee ? "str" : "dex";
        const statValue = this.actor.system.stats[statKey]?.total ?? this.actor.system.stats[statKey]?.value ?? 0;
        const strValue = Number(this.actor.system.stats.str?.total ?? this.actor.system.stats.str?.value ?? 0);
        const rank = this._resolveCombatSkillRank(item.system.skill);
        const formState = this._readWeaponRollFormState(form);
        let mods = this._buildWeaponRollMods(formState);

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
        const rangedContext = this._resolveRangedAttackContext(item, isMelee);
        // ---------------------------

        // Apply Modifiers
        if (isMelee) {
            this._applyMeleeModifiers(form, strValue, mods);

            // --- DEFENSE MODIFIERS (Melee) - Note: applied in _applyMeleeModifiers ---
            // Add notes for display (modifiers already applied in helper)
            if (mods.combatDef > 0) {
                notes.push(`Defended (Combat Def: -${mods.combatDef})`);
            }
            if (mods.acroDef > 0) {
                const pen = mods.acroDef * 2;
                notes.push(`Defended (Acrobatics: -${pen})`);
            }
            if (mods.targetProne) {
                mods.successDie += 2;
                notes.push(`Target Prone (+2 SD)`);
            }
            // ---------------------------------

            // Clamp reserved dice to available rank.
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
            const canFire = await this._applyRangedModifiers(item, form, mods, notes, flags, {
                forceLongRange: rangedContext.isLongRange
            });
            if (canFire === false) return;
        }

        const penalty = this.actor.system.wounds.penalty || 0;
        if (game.settings.get("sla-industries", "enableAutomaticWoundPenalties")) {
            mods.allDice -= penalty;
        }

        // Powersuit attacks apply their built-in attack penalty automatically.
        if (item.system.powersuitAttack) {
            const attackPenalty = Number(item.system.attackPenalty) || 0;
            if (attackPenalty !== 0) {
                mods.allDice += attackPenalty;
                if (attackPenalty < 0) notes.push(`Powersuit Attack (${attackPenalty})`);
                else notes.push(`Powersuit Attack (+${attackPenalty})`);
            }
        }

        // 4. ROLL
        // Base modifier excludes success-die-only modifiers (aim/target prone).
        const baseModifier = statValue + rank + mods.allDice;

        // 5. CALCULATE SUCCESS
        let skillDiceCount = rank + 1 + (mods.rank || 0) - (mods.reservedDice || 0) - (mods.aimAuto || 0);
        if (skillDiceCount < 0) skillDiceCount = 0;

        const rollFormula = `1d10 + ${skillDiceCount}d10`;
        let roll = createSLARoll(rollFormula);
        await roll.evaluate();

        // We pass the final Base Mod and Success Die Mod
        // TN (Target Number) is 10 for all weapon attacks (melee and ranged)
        const TN = 10;
        const result = calculateRollResult(roll, baseModifier, TN, {
            autoSkillSuccesses: mods.aimAuto || 0,
            successDieModifier: mods.successDie // Pass explicit SD mod
        });

        const { rofRerollSD, rofRerollSkills } = await this._applyWeaponRofRerolls({
            roll,
            flags,
            notes
        });

        const { sdTotal, isBaseSuccess } = this._computeSuccessDieOutcome({
            roll,
            baseModifier,
            successDieModifier: mods.successDie,
            targetNumber: TN
        });

        const { skillDiceData, skillSuccessCount } = this._buildSkillDiceResults({
            roll,
            baseModifier,
            targetNumber: TN,
            autoSuccesses: mods.autoSkillSuccesses,
            rerollIndexes: rofRerollSkills,
            includeRerollFlag: true
        });

        const { isSuccess, successThroughExperience } = this._applySuccessThroughExperience({
            isBaseSuccess,
            skillSuccessCount,
            threshold: 4,
            notes
        });

        // Update Result Color if it became a success
        const resultColor = isSuccess ? '#39ff14' : '#f55';


        const { mosDamageBonus, mosEffectText, mosChoiceData, shouldApplyHeadWound } = this._resolveWeaponMosOutcome({
            isSuccess,
            successThroughExperience,
            skillSuccessCount
        });
        if (shouldApplyHeadWound) {
            await this._applyHeadshotSideEffect(notes);
        }

        // Damage Calculation
        // Note: If user has a choice, we DO NOT add the bonus yet. They must click the button.
        let rawBase = item.system.damage || item.system.dmg || "0";
        let baseDmg = String(rawBase);
        let totalMod = mods.damage + mosDamageBonus;

        const finalDmgFormula = this._buildWeaponDamageFormula(baseDmg, totalMod);

        let showButton = isSuccess && (finalDmgFormula && finalDmgFormula !== "0");

        // 1. CAPTURE AD VALUE (Ensure it's a number)
        let adValue = Number(item.system.ad) || 0;
        if (item.system.powersuitAttack) {
            const adFromStrMinus = Number(item.system.adFromStrMinus) || 0;
            if (adFromStrMinus > 0) {
                adValue = Math.max(0, strValue - adFromStrMinus);
            }
        }

        const notesText = notes.join(" ");
        const templateData = this._buildWeaponRollTemplateData({
            item,
            roll,
            baseModifier,
            notesText,
            successDieModifier: mods.successDie,
            resultColor,
            sdTotal,
            skillDiceData,
            showDamageButton: showButton,
            finalDamageFormula: finalDmgFormula,
            adValue,
            rofRerollSD,
            isSuccess,
            skillSuccessCount,
            mosEffectText,
            mosChoiceData
        });

        const chatContent = await foundry.applications.handlebars.renderTemplate("systems/sla-industries/templates/chat/chat-weapon-rolls.hbs", templateData);

        roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: chatContent,
            flags: {
                sla: this._buildSlaRollFlags({
                    baseModifier: baseModifier,
                    itemName: item.name.toUpperCase(),
                    notes: notesText,
                    tn: TN,
                    extra: {
                        rofRerollSD: rofRerollSD,
                        rofRerollSkills: rofRerollSkills,
                        targets: Array.from(game.user.targets).map(t => t.document.uuid),
                        damageBase: baseDmg,
                        damageMod: mods.damage,
                        adValue: adValue,
                        autoSkillSuccesses: mods.autoSkillSuccesses,
                        successDieModifier: mods.successDie,
                        isWeapon: true
                    }
                })
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

    _readExplosiveRollForm(form) {
        return {
            mod: Number(form.modifier?.value) || 0,
            cover: Number(form.cover?.value) || 0,
            aiming: form.aiming?.value || "none",
            blind: form.blind?.checked || false
        };
    }

    _resolveExplosiveBlastData(item) {
        const innerDist = item.system.blastRadiusInner || 0;
        let outerDist = item.system.blastRadiusOuter || 0;
        if (outerDist === 0) outerDist = 5;
        return { innerDist, outerDist };
    }

    _resolveExplosiveSkillContext(item) {
        const skillName = item.system.skill || "throw";
        const combatSkills = CONFIG.SLA?.combatSkills || {};
        const resolvedSkillName = combatSkills[skillName] || skillName;

        let rank = 0;
        let skillItemForStat = null;
        if (resolvedSkillName) {
            const skillItem = this.actor.items.find(i =>
                i.type === "skill" && i.name.trim().toLowerCase() === resolvedSkillName.trim().toLowerCase()
            );
            if (skillItem) {
                rank = Number(skillItem.system.rank) || 0;
                skillItemForStat = skillItem;
            }
        }

        const statKey = skillItemForStat?.system?.stat || "dex";
        const statValue = this.actor.system.stats[statKey]?.total ?? this.actor.system.stats[statKey]?.value ?? 0;
        const strValue = this.actor.system.stats.str?.total ?? this.actor.system.stats.str?.value ?? 0;
        return { rank, statValue, strValue };
    }

    _buildExplosiveMods(rollData) {
        return {
            successDie: 0,
            allDice: rollData.mod,
            rank: 0,
            damage: 0,
            autoSkillSuccesses: 0
        };
    }

    _applyExplosiveRollAdjustments(rollData, mods) {
        if (this.actor.system.conditions?.prone) mods.allDice -= 1;
        if (this.actor.system.conditions?.stunned) mods.allDice -= 1;
        const penalty = this.actor.system.wounds.penalty || 0;
        if (game.settings.get("sla-industries", "enableAutomaticWoundPenalties")) {
            mods.allDice -= penalty;
        }

        mods.successDie += rollData.cover;
        if (rollData.aiming === "sd") mods.successDie += 1;
        if (rollData.aiming === "skill") mods.autoSkillSuccesses += 1;
    }

    _getActorTokenForExplosiveRange() {
        return this.token?.object ?? this.actor.getActiveTokens()[0];
    }

    _appendExplosiveRangeNotes(notes, item, strValue, target, token) {
        if (item.system.blastRadiusInner || item.system.blastRadiusOuter) {
            const txt = item.system.blastRadiusInner > 0
                ? `${item.system.blastRadiusInner}/${item.system.blastRadiusOuter}m`
                : `${item.system.blastRadiusOuter}m`;
            notes.push(`<strong>Blast:</strong> ${txt}`);
        }

        const effectiveRange = 15 + (Math.min(Math.max(0, strValue), 5) * 5);
        notes.push(`<strong>Max Range:</strong> ${effectiveRange}m`);

        if (!token) return;
        const ray = new foundry.canvas.geometry.Ray(token.center, target);
        const distMeters = (ray.distance / canvas.scene.grid.size) * canvas.scene.grid.distance;
        if (distMeters > effectiveRange) {
            notes.push(`<strong style='color:#ffa500'>OUT OF RANGE (${Math.round(distMeters)}m)</strong>`);
        }
    }

    _resolveDeviationWallCollision(start, end, epsilon = 2) {
        const fallback = { x: end.x, y: end.y, blocked: false };
        if (!canvas?.walls) return fallback;

        const ray = new foundry.canvas.geometry.Ray(start, end);
        const resolveImpact = (collision) => {
            if (!collision) return null;
            if (Array.isArray(collision)) return resolveImpact(collision[0]);

            const impact = collision.intersection || collision.point || collision;
            if (impact?.x == null || impact?.y == null) return null;

            // Pull back slightly so the template center never crosses the wall boundary.
            const t = Math.max(0, Math.min(1, (ray.distance - epsilon) / (ray.distance || 1)));
            if (ray.distance <= epsilon) return { x: start.x, y: start.y, blocked: true };
            return {
                x: start.x + ((impact.x - start.x) * t),
                y: start.y + ((impact.y - start.y) * t),
                blocked: true
            };
        };

        try {
            const closest = canvas.walls.checkCollision(ray, { type: "move", mode: "closest" });
            const resolvedClosest = resolveImpact(closest);
            if (resolvedClosest) return resolvedClosest;
        } catch (_err) {
            // Keep fallback path active for API/version differences.
        }

        try {
            const any = canvas.walls.checkCollision(ray, { type: "move", mode: "any" });
            if (any === true) {
                const collisions = canvas.walls.checkCollision(ray, { type: "move", mode: "all" });
                const resolvedAll = resolveImpact(collisions);
                if (resolvedAll) return resolvedAll;
            }
        } catch (_err) {
            // Keep fallback path active for API/version differences.
        }

        return fallback;
    }

    _resolveExplosiveDeviation({ isBaseSuccess, skillSuccessCount, target, token }) {
        let outcomeText = "";
        let resultColor = "#f55";
        let isSuccess = false;
        let finalX = target.x;
        let finalY = target.y;
        let wallBlocked = false;

        const allDiceFailed = (!isBaseSuccess) && (skillSuccessCount === 0);
        if (allDiceFailed) {
            outcomeText = "<strong style='color:#ff0000; font-size:1.1em;'>FUMBLE: Detonates on Thrower!</strong>";
            resultColor = "#ff0000";
            if (token) {
                finalX = token.center.x;
                finalY = token.center.y;
            }
            return { outcomeText, resultColor, isSuccess, finalX, finalY };
        }

        if (isBaseSuccess && skillSuccessCount > 0) {
            outcomeText = "<strong style='color:#39ff14'>LANDS ON TARGET</strong>";
            resultColor = "#39ff14";
            isSuccess = true;
            return { outcomeText, resultColor, isSuccess, finalX, finalY };
        }

        const devMeters = isBaseSuccess ? 5 : 10;
        outcomeText = isBaseSuccess
            ? "<strong style='color:#ffa500'>DEVIATION: 5m</strong>"
            : "<strong style='color:#ff5555'>DEVIATION: 10m</strong>";
        resultColor = isBaseSuccess ? "#ffa500" : "#ff5555";
        const devPixels = (devMeters / canvas.scene.grid.distance) * canvas.scene.grid.size;
        const angle = Math.random() * 2 * Math.PI;
        finalX += Math.cos(angle) * devPixels;
        finalY += Math.sin(angle) * devPixels;

        const wallCollision = this._resolveDeviationWallCollision(target, { x: finalX, y: finalY });
        finalX = wallCollision.x;
        finalY = wallCollision.y;
        wallBlocked = wallCollision.blocked;

        return { outcomeText, resultColor, isSuccess, finalX, finalY, wallBlocked };
    }

    async _placeExplosiveTemplates({ item, blastRadius, innerDist, finalX, finalY, isSuccess }) {
        try {
            const templates = [{
                t: "circle",
                user: game.user.id,
                x: finalX,
                y: finalY,
                distance: blastRadius,
                fillColor: game.user.color,
                fillAlpha: 0.2,
                flags: { sla: { itemId: item.id, isDeviation: !isSuccess, type: "outer" } }
            }];

            if (innerDist > 0 && innerDist < blastRadius) {
                templates.push({
                    t: "circle",
                    user: game.user.id,
                    x: finalX,
                    y: finalY,
                    distance: innerDist,
                    fillColor: game.user.color,
                    fillAlpha: 0.6,
                    flags: { sla: { itemId: item.id, isDeviation: !isSuccess, type: "inner" } }
                });
            }

            canvas.scene.createEmbeddedDocuments("MeasuredTemplate", templates);
        } catch (err) {
            console.error("SLA | Template Creation Failed:", err);
        }
    }

    async _processExplosiveRoll(item, html) {
        const form = html[0].querySelector("form");
        if (!form) return;

        const rollData = this._readExplosiveRollForm(form);
        const { innerDist, outerDist } = this._resolveExplosiveBlastData(item);
        ui.notifications.info("Select target position...");
        const target = await this._waitForCanvasClick();
        if (!target) return;
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

        const { rank, statValue, strValue } = this._resolveExplosiveSkillContext(item);
        const mods = this._buildExplosiveMods(rollData);
        let notes = [];
        const token = this._getActorTokenForExplosiveRange();
        let resolvedTarget = target;
        if (token) {
            const throwCollision = this._resolveDeviationWallCollision(token.center, target);
            if (throwCollision.blocked) {
                resolvedTarget = { x: throwCollision.x, y: throwCollision.y };
                notes.push("<strong>Throw:</strong> Stopped by wall.");
                ui.notifications.info(`${item.name} hit a wall before reaching the target point.`);
            }
        }

        this._appendExplosiveRangeNotes(notes, item, strValue, resolvedTarget, token);
        this._applyExplosiveRollAdjustments(rollData, mods);

        const baseModifier = statValue + rank + mods.allDice;
        const skillDiceCount = Math.max(0, rank + 1 + mods.rank);
        const rollFormula = `1d10 + ${skillDiceCount}d10`;
        let roll = createSLARoll(rollFormula);
        await roll.evaluate();

        const TN = 10;
        const { sdTotal, isBaseSuccess } = this._computeSuccessDieOutcome({
            roll,
            baseModifier,
            successDieModifier: mods.successDie,
            targetNumber: TN
        });

        const { skillDiceData, skillSuccessCount } = this._buildSkillDiceResults({
            roll,
            baseModifier,
            targetNumber: TN,
            autoSuccesses: mods.autoSkillSuccesses
        });

        const deviationData = this._resolveExplosiveDeviation({
            isBaseSuccess,
            skillSuccessCount,
            target: resolvedTarget,
            token
        });
        const { outcomeText, resultColor, isSuccess, finalX, finalY, wallBlocked } = deviationData;

        if (wallBlocked) {
            notes.push("<strong>Deviation:</strong> Stopped by wall.");
            ui.notifications.info(`${item.name} deviation hit a wall.`);
        }

        if (innerDist > 0) {
            notes.push(`<br/><strong>Kill Zone (< ${innerDist}m):</strong> +2 Damage`);
        }

        await this._placeExplosiveTemplates({ item, blastRadius, innerDist, finalX, finalY, isSuccess });

        let baseDmg = item.system.damage || "0";
        const adValue = Number(item.system.ad) || 0;

        const notesText = notes.join(" ");
        const templateData = {
            actorUuid: this.actor.uuid,
            borderColor: resultColor,
            headerColor: resultColor,
            resultColor: resultColor,
            itemName: item.name.toUpperCase(),
            successTotal: sdTotal,
            tooltip: this._generateTooltip(roll, baseModifier, mods.successDie),
            skillDice: skillDiceData,
            notes: notesText,
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
            isEbb: true // Legacy chat template flag for this non-weapon card path.
        };

        const chatContent = await foundry.applications.handlebars.renderTemplate("systems/sla-industries/templates/chat/chat-weapon-rolls.hbs", templateData);

        roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: chatContent,
            flags: {
                sla: this._buildSlaRollFlags({
                    baseModifier: baseModifier,
                    itemName: item.name.toUpperCase(),
                    notes: notesText,
                    tn: 10,
                    extra: {
                        targets: Array.from(game.user.targets).map(t => t.document.uuid),
                        damageBase: baseDmg,
                        adValue: adValue
                    }
                })
            }
        });
    }

    _resolveEbbDisciplineName(disciplineName) {
        let resolvedName = disciplineName;
        const ebbDisciplines = CONFIG.SLA?.ebbDisciplines || {};
        for (const [key, label] of Object.entries(ebbDisciplines)) {
            if (key === disciplineName || label === disciplineName) {
                resolvedName = label;
                break;
            }
        }
        return resolvedName;
    }

    _resolveEbbContext(item) {
        const formulaRating = item.system.formulaRating || 7;
        const currentFlux = this.actor.system.stats.flux?.value || 0;
        const fluxCost = 1;
        const disciplineName = item.system.discipline;
        const resolvedDisciplineName = this._resolveEbbDisciplineName(disciplineName);
        const disciplineItem = this.actor.items.find(i =>
            i.type === "discipline" && i.name.toLowerCase() === resolvedDisciplineName.toLowerCase()
        );

        return { formulaRating, currentFlux, fluxCost, resolvedDisciplineName, disciplineItem };
    }

    _calculateEbbModifier(rank) {
        const statKey = "conc";
        const statValue = this.actor.system.stats[statKey]?.total ?? this.actor.system.stats[statKey]?.value ?? 0;
        let globalMod = 0;
        if (this.actor.system.conditions?.prone) globalMod -= 1;
        if (this.actor.system.conditions?.stunned) globalMod -= 1;
        const penalty = this.actor.system.wounds.penalty || 0;
        const woundPenalty = game.settings.get("sla-industries", "enableAutomaticWoundPenalties") ? penalty : 0;
        return statValue + rank - woundPenalty + globalMod;
    }

    async _createAndEvaluateEbbRoll(rank) {
        const skillDiceCount = rank + 1;
        const rollFormula = `1d10 + ${skillDiceCount}d10`;
        let roll = new Roll(rollFormula);

        if (roll.terms.length > 0 && roll.terms[0].constructor.name === "Die") {
            roll.terms[0].options.appearance = {
                foreground: "#FFFFFF",
                background: "#000000",
                edge: "#333333"
            };
        }

        await roll.evaluate();
        return roll;
    }

    _collectEbbSkillDiceData(roll, modifier, formulaRating) {
        const { skillDiceData, skillSuccessCount } = this._buildSkillDiceResults({
            roll,
            baseModifier: modifier,
            targetNumber: formulaRating
        });
        return { skillDiceData, skillSuccesses: skillSuccessCount };
    }

    _resolveEbbOutcomeText(isBaseSuccess, skillSuccesses) {
        const allDiceFailed = (!isBaseSuccess) && (skillSuccesses === 0);
        const isSuccessful = isBaseSuccess || (skillSuccesses >= 1);

        let mosEffectText = "Standard Success";
        let failureConsequence = "Failed";

        if (isSuccessful) {
            if (skillSuccesses === 2) mosEffectText = "+1 Damage / Effect";
            else if (skillSuccesses === 3) mosEffectText = "+2 Damage / Repeat Ability";
            else if (skillSuccesses >= 4) mosEffectText = "<strong style='color:#39ff14'>CRITICAL:</strong> +4 Dmg | Regain 1 FLUX";
        } else if (allDiceFailed) {
            failureConsequence = "<strong style='color:#ff5555'>SEVERE FAILURE:</strong> -3 HP & -1 Extra FLUX";
        }

        return { isSuccessful, mosEffectText, failureConsequence };
    }

    _buildEbbDamageFormula(item, isSuccessful, skillSuccesses) {
        let rawBase = item.system.dmg || item.system.damage || "0";
        let baseDmg = String(rawBase);
        let mosDamageBonus = 0;

        if (isSuccessful) {
            if (skillSuccesses === 2) mosDamageBonus = 1;
            if (skillSuccesses === 3) mosDamageBonus = 2;
            if (skillSuccesses >= 4) mosDamageBonus = 4;
        }

        let finalDmgFormula = baseDmg;
        if (baseDmg !== "0" && baseDmg !== "" && mosDamageBonus > 0) {
            finalDmgFormula = `${baseDmg} + ${mosDamageBonus}`;
        }

        return { finalDmgFormula, showDamageButton: isSuccessful && (finalDmgFormula && finalDmgFormula !== "0") };
    }

    _buildEbbTemplateData({
        item,
        roll,
        modifier,
        resultColor,
        successTotal,
        skillDiceData,
        formulaRating,
        showDamageButton,
        finalDmgFormula,
        isSuccessful,
        skillSuccesses,
        mosEffectText,
        failureConsequence
    }) {
        return {
            borderColor: resultColor,
            headerColor: resultColor,
            resultColor: resultColor,
            actorUuid: this.actor.uuid,
            itemName: item.name.toUpperCase(),
            successTotal: successTotal,
            tooltip: this._generateTooltip(roll, modifier, 0),
            skillDice: skillDiceData,
            notes: `<strong>Formula Rating:</strong> ${formulaRating}`,
            showDamageButton: showDamageButton,
            dmgFormula: finalDmgFormula,
            adValue: item.system.ad || 0,
            mos: {
                isSuccess: isSuccessful,
                hits: skillSuccesses,
                effect: isSuccessful ? mosEffectText : failureConsequence
            },
            isEbb: true
        };
    }

    async _executeEbbRoll(item) {
        const { formulaRating, currentFlux, fluxCost, resolvedDisciplineName, disciplineItem } = this._resolveEbbContext(item);
        if (currentFlux < fluxCost) {
            ui.notifications.error("Insufficient FLUX.");
            return;
        }
        await this.actor.update({ "system.stats.flux.value": Math.max(0, currentFlux - fluxCost) });

        if (!disciplineItem) {
            ui.notifications.warn(`Missing Discipline Item: ${resolvedDisciplineName}`);
            return;
        }

        const rank = Number(disciplineItem.system.rank) || 0;
        const modifier = this._calculateEbbModifier(rank);
        const roll = await this._createAndEvaluateEbbRoll(rank);
        const { sdTotal: successTotal, isBaseSuccess } = this._computeSuccessDieOutcome({
            roll,
            baseModifier: modifier,
            successDieModifier: 0,
            targetNumber: formulaRating
        });
        const resultColor = isBaseSuccess ? '#39ff14' : '#f55';

        const { skillDiceData, skillSuccesses } = this._collectEbbSkillDiceData(roll, modifier, formulaRating);
        const { isSuccessful, mosEffectText, failureConsequence } = this._resolveEbbOutcomeText(isBaseSuccess, skillSuccesses);
        const { finalDmgFormula, showDamageButton } = this._buildEbbDamageFormula(item, isSuccessful, skillSuccesses);
        const notesText = `<strong>Formula Rating:</strong> ${formulaRating}`;
        const templateData = this._buildEbbTemplateData({
            item,
            roll,
            modifier,
            resultColor,
            successTotal,
            skillDiceData,
            formulaRating,
            showDamageButton,
            finalDmgFormula,
            isSuccessful,
            skillSuccesses,
            mosEffectText,
            failureConsequence
        });

        const chatContent = await foundry.applications.handlebars.renderTemplate("systems/sla-industries/templates/chat/chat-weapon-rolls.hbs", templateData);

        roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: chatContent,
            flags: {
                sla: this._buildSlaRollFlags({
                    baseModifier: modifier,
                    itemName: item.name.toUpperCase(),
                    notes: notesText,
                    tn: formulaRating,
                    extra: {
                        isWeapon: false,
                        isEbb: true
                    }
                })
            }
        });
    }

    // --- DROP ITEM HANDLER ---
    async _processDroppedSkills(skillsArray, sourceFlag) {
        if (!skillsArray || !Array.isArray(skillsArray) || skillsArray.length === 0) return;

        const toCreate = [];
        const toUpdate = [];

        for (const skillData of skillsArray) {
            if (!skillData || !skillData.name) continue;

            const existingSkill = this.actor.items.find(i =>
                i.type === "skill" && i.name.toLowerCase() === skillData.name.toLowerCase()
            );

            if (existingSkill) {
                const currentRank = existingSkill.system?.rank || 0;
                toUpdate.push({ _id: existingSkill.id, "system.rank": currentRank + 1 });
                ui.notifications.info(`Upgraded ${existingSkill.name} to Rank ${currentRank + 1}`);
                continue;
            }

            toCreate.push({
                name: skillData.name,
                type: "skill",
                img: skillData.img || "icons/svg/book.svg",
                system: {
                    rank: 1,
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
            });
        }

        if (toCreate.length > 0) {
            await this.actor.createEmbeddedDocuments("Item", toCreate);
        }
        if (toUpdate.length > 0) {
            await this.actor.updateEmbeddedDocuments("Item", toUpdate);
        }
    }

    async _replaceSingletonItemAndLinkedSkills(itemType, linkedSkillFlag) {
        const existing = this.actor.items.find(i => i.type === itemType);
        if (!existing) return;

        const linkedSkills = this.actor.items.filter(i => i.getFlag("sla-industries", linkedSkillFlag));
        const idsToDelete = [existing.id, ...linkedSkills.map(i => i.id)];
        await this.actor.deleteEmbeddedDocuments("Item", idsToDelete);
    }

    _validatePackageRequirements(packageData) {
        const requirements = packageData.system.requirements || {};
        for (const [key, minVal] of Object.entries(requirements)) {
            const actorStat = this.actor.system.stats[key]?.value || 0;
            if (actorStat < minVal) {
                ui.notifications.error(`Requirement not met: ${key.toUpperCase()} must be ${minVal}+`);
                return false;
            }
        }
        return true;
    }

    async _handleSpeciesDrop(itemData) {
        await this._replaceSingletonItemAndLinkedSkills("species", "fromSpecies");
        await this.actor.createEmbeddedDocuments("Item", [itemData]);
        await this.actor.update({ "system.bio.species": itemData.name });

        if (itemData.system.stats) {
            const updates = {};
            for (const [key, val] of Object.entries(itemData.system.stats)) {
                const valueToSet = (typeof val === "object" && val.min !== undefined) ? val.min : val;
                updates[`system.stats.${key}.value`] = valueToSet;
            }
            await this.actor.update(updates);
        }

        await this._processDroppedSkills(itemData.system.skills, "fromSpecies");
    }

    async _handlePackageDrop(itemData) {
        if (!this._validatePackageRequirements(itemData)) return;

        await this._replaceSingletonItemAndLinkedSkills("package", "fromPackage");
        await this.actor.createEmbeddedDocuments("Item", [itemData]);
        await this.actor.update({ "system.bio.package": itemData.name });
        await this._processDroppedSkills(itemData.system.skills, "fromPackage");
    }

    _shouldAutoEquipDroppedItem(itemData) {
        return (this.actor.type === "npc" && ["weapon", "armor"].includes(itemData.type))
            || (this.actor.type === "vehicle" && itemData.type === "weapon");
    }

    async _createEquippedItem(itemData) {
        foundry.utils.setProperty(itemData, "system.equipped", true);
        return this.actor.createEmbeddedDocuments("Item", [itemData]);
    }

    async _onDropItem(event, data) {
        if (!this.actor.isOwner) return false;
        const item = await Item.implementation.fromDropData(data);
        if (!item) return false;
        const itemData = item.toObject();

        if (itemData.type === "species") {
            await this._handleSpeciesDrop(itemData);
            return;
        }

        if (itemData.type === "package") {
            await this._handlePackageDrop(itemData);
            return;
        }

        if (this._shouldAutoEquipDroppedItem(itemData)) {
            return this._createEquippedItem(itemData);
        }

        return super._onDropItem(event, data);
    }

    async _onDropVehicleWeapon(event) {
        event.preventDefault();
        if (!this.actor.isOwner || this.actor.type !== "vehicle") return false;

        let dropped;
        try {
            dropped = JSON.parse(event.originalEvent?.dataTransfer?.getData("text/plain") ?? event.dataTransfer?.getData("text/plain"));
        } catch (_err) {
            return false;
        }
        if (!dropped || dropped.type !== "Item") return false;

        const item = await Item.implementation.fromDropData(dropped);
        if (!item || item.type !== "weapon") {
            ui.notifications.warn("Only weapon items can be dropped into vehicle weapons.");
            return false;
        }

        const itemData = item.toObject();
        await this._createEquippedItem(itemData);
        ui.notifications.info(`Equipped ${itemData.name} on ${this.actor.name}.`);
        return true;
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
    async _applyRangedModifiers(item, form, mods, notes, flags, options = {}) {
        return await applyRangedModifiers(item, form, mods, notes, flags, options);
    }
}
