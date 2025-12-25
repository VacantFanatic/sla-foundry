/**
 * Extend the basic ActorSheet
 * @extends {ActorSheet}
 */
import { LuckDialog } from "../apps/luck-dialog.mjs";
import { calculateRollResult, generateDiceTooltip } from "../helpers/dice.mjs";

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
        const actorData = context.data;

        if (!actorData || !actorData.system) return context;

        context.system = actorData.system;
        context.flags = actorData.flags;

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

        if (actorData.type == 'character' || actorData.type == 'npc') {
            this._prepareItems(context);
        }

        context.rollData = context.actor.getRollData();

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
        // 1. Initialize Containers
        const inventory = {
            weapon: { label: "Weapons", items: [] },
            armor: { label: "Armor", items: [] },
            magazine: { label: "Ammunition", items: [] },
            drug: { label: "Drugs", items: [] },
            item: { label: "Gear", items: [] }
        };

        const traits = [];
        const ebbFormulas = [];
        const disciplines = [];
        const skills = [];

        // Skill Buckets
        const skillsByStat = {
            "str": { label: "STR", items: [] },
            "dex": { label: "DEX", items: [] },
            "know": { label: "KNOW", items: [] },
            "conc": { label: "CONC", items: [] },
            "cha": { label: "CHA", items: [] },
            "cool": { label: "COOL", items: [] },
            "other": { label: "OTHER", items: [] }
        };

        // Separate Arrays for Combat Tab
        const weapons = [];
        const armors = [];

        // 2. Sort Items into Containers
        for (let i of context.items) {
            i.img = i.img || DEFAULT_TOKEN;

            // INVENTORY GROUPS
            if (inventory[i.type]) {
                inventory[i.type].items.push(i);
            }

            // COMBAT TAB SPECIFIC
            if (i.type === 'weapon') {
                // --- NEW: RELOAD LOGIC ---
                // Hide reload button if skill is melee or unarmed
                const skillKey = (i.system.skill || "").toLowerCase();
                i.isReloadable = !["melee", "unarmed"].includes(skillKey);

                weapons.push(i);
            }

            if (i.type === 'armor') armors.push(i);

            // OTHER ITEMS
            if (i.type === 'trait') traits.push(i);
            else if (i.type === 'ebbFormula') ebbFormulas.push(i);
            else if (i.type === 'discipline') disciplines.push(i);

            else if (i.type === 'skill') {
                const stat = (i.system.stat || "dex").toLowerCase();
                if (skillsByStat[stat]) skillsByStat[stat].items.push(i);
                else skillsByStat["other"].items.push(i);
                skills.push(i);
            }
        }

        // 3. Sorting Function (Alphabetical)
        const sortFn = (a, b) => a.name.localeCompare(b.name);

        // Sort every list
        Object.values(inventory).forEach(cat => cat.items.sort(sortFn));
        traits.sort(sortFn);
        ebbFormulas.sort(sortFn);
        disciplines.sort(sortFn);
        weapons.sort(sortFn);
        armors.sort(sortFn);
        skills.sort(sortFn);

        for (const key in skillsByStat) {
            skillsByStat[key].items.sort(sortFn);
        }

        // 4. Ebb Nesting Logic
        const configDis = CONFIG.SLA?.ebbDisciplines || {};
        const nestedDisciplines = [];
        const rawFormulas = [...ebbFormulas];

        disciplines.forEach(d => {
            d.formulas = [];
            nestedDisciplines.push(d);
        });

        rawFormulas.forEach(f => {
            const key = f.system.discipline;
            const parent = nestedDisciplines.find(d => d.name === key || d.name === configDis[key]);
            if (parent) parent.formulas.push(f);
        });

        // 5. Assign to Context
        context.inventory = inventory;
        context.traits = traits;
        context.disciplines = nestedDisciplines;
        context.skillsByStat = skillsByStat;

        context.weapons = weapons;
        context.armors = armors;
        context.skills = skills;
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
            ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                content: `
                <div style="background:#1a1a25; border:1px solid #d05e1a; color:#eee; padding:5px; font-family:'Roboto Condensed';">
                    <h3 style="color:#d05e1a; border-bottom:1px solid #555; margin:0 0 5px 0;">DRUG USED: ${item.name.toUpperCase()}</h3>
                    <div>${this.actor.name} consumes a dose.</div>
                    <div style="font-size:0.9em; color:#aaa; margin-top:5px;">
                        <strong>Duration:</strong> ${item.system.duration || "Unknown"}<br>
                        <strong>Remaining:</strong> ${newQty}
                    </div>
                </div>
            `
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
        let content = `<p>Select magazine to load into <strong>${weaponName}</strong>:</p>`;
        content += `<div class="form-group"><select id="magazine-select" style="width:100%; box-sizing:border-box;">`;
        candidates.forEach(c => {
            content += `<option value="${c.id}">${c.name} (Qty: ${c.system.quantity})</option>`;
        });
        content += `</select></div><br>`;

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

                // Pass the flag to your existing dialog renderer
                await this._renderAttackDialog(item, isMelee);

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

            let roll = new Roll("1d10");
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

            let rawDie = roll.terms[0].results[0].result;
            let finalTotal = rawDie + finalMod;
            const resultColor = finalTotal > 10 ? '#39ff14' : '#f55';

            const tooltipHtml = this._generateTooltip(roll, finalMod, 0);

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

            const chatContent = await renderTemplate("systems/sla-industries/templates/chat/chat-weapon-rolls.hbs", templateData);

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

        // 2. Prepare Template Data
        const templateData = {
            item: item,
            isMelee: isMelee,
            validModes: validModes,
            selectedMode: defaultModeKey, // Pass this to HBS for the <select>

            // Melee uses item recoil (usually 0), Ranged uses the recoil of the default mode
            recoil: isMelee
                ? (item.system.recoil || 0)
                : (validModes[defaultModeKey]?.recoil || 0)
        };

        const content = await renderTemplate("systems/sla-industries/templates/dialogs/attack-dialog.hbs", templateData);

        new Dialog({
            title: `Attack: ${item.name}`,
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
        const rank = item.system.rank || 0;

        // 2. MODIFIERS (Wounds, Prone, Stunned)
        let globalMod = 0;
        if (this.actor.system.conditions?.prone) globalMod -= 1;
        if (this.actor.system.conditions?.stunned) globalMod -= 1;
        const penalty = this.actor.system.wounds.penalty || 0;

        const baseModifier = statValue + rank + globalMod - penalty;

        // 3. ROLL FORMULA
        // CORRECTION: 1 Success Die + (Rank + 1) Skill Dice
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
            showDamageButton: false,
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

        const chatContent = await renderTemplate("systems/sla-industries/templates/chat/chat-weapon-rolls.hbs", templateData);

        roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: chatContent,
            flags: {
                sla: {
                    baseModifier: baseModifier,
                    itemName: item.name.toUpperCase(),
                    rofRerollSD: rofRerollSD,
                    rofRerollSkills: rofRerollSkills
                }
            }
        });
    }

    // --- HELPERS: HTML GENERATION ---
    // Kept for legacy compatibility if other modules call it, but uses new helper internally
    _generateTooltip(roll, baseModifier, successDieMod) {
        return generateDiceTooltip(roll, baseModifier, successDieMod);
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
            reservedDice: 0
        };

        let notes = [];
        let flags = { rerollSD: false, rerollAll: false };

        // Conditions
        if (this.actor.system.conditions?.prone) mods.allDice -= 1;
        if (this.actor.system.conditions?.stunned) mods.allDice -= 1;

        // Apply Modifiers
        if (isMelee) {
            this._applyMeleeModifiers(form, strValue, mods);

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
        const baseModifier = statValue + rank + mods.allDice;

        // OLD LINE: const skillDiceCount = Math.max(0, rank + 1 + mods.rank);
        // NEW LINE: Subtract reservedDice from the pool
        const skillDiceCount = Math.max(0, rank + 1 + mods.rank - mods.reservedDice);

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

        // --- ROF REROLL LOGIC (Burst / Auto) ---
        // "May reroll...". We interpret this as "Keep Highest" for user convenience.
        console.log("SLA | ROF Check - Flags:", flags);
        console.log("SLA | Initial Roll Terms:", roll.terms);

        // We track which dice were rerolled to prevent Luck abuse.
        let rofRerollSD = false;
        let rofRerollSkills = [];

        // Helper: Reroll a single result and keep highest
        const rerollDieKeepHighest = async (currentResult) => {
            const newRoll = new Roll("1d10");
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
        const TN = 11;
        const sdRaw = roll.terms[0].results[0].result;
        const sdTotal = sdRaw + baseModifier + mods.successDie;

        // Initial Success Check
        let isSuccess = sdTotal >= TN;
        // Logic will be cleaner if I calculate isSuccess first, then override.

        // MOS Calculation
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

            adValue: adValue, // <--- CRITICAL FIX: Pass AD to template

            mos: {
                isSuccess: isSuccess,
                hits: skillSuccessCount,
                effect: mosEffectText,
                ...mosChoiceData
            },
            // Luck Data
            canUseLuck: this.actor.system.stats.luck.value > 0,
            luckValue: this.actor.system.stats.luck.value,
            luckSpent: false
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
                    // Damage Context for Luck Reroll
                    damageBase: baseDmg,
                    damageMod: mods.damage,
                    adValue: adValue,
                    autoSkillSuccesses: mods.autoSkillSuccesses
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

        const rank = disciplineItem.system.rank || 0;

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
            }
        };

        const chatContent = await renderTemplate("systems/sla-industries/templates/chat/chat-weapon-rolls.hbs", templateData);

        roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: chatContent,
            flags: {
                sla: {
                    baseModifier: modifier,
                    itemName: item.name.toUpperCase()
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
                            stat: skillData.system?.stat || "dex", // Fallback if missing
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
            if (existing) await existing.delete();

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
            if (existing) await existing.delete();

            await this.actor.createEmbeddedDocuments("Item", [itemData]);
            await this.actor.update({ "system.bio.package": itemData.name });

            await processSkills(itemData.system.skills, "fromPackage");
            return;
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
        // STR Bonus
        if (strValue >= 7) mods.damage += 4;
        else if (strValue === 6) mods.damage += 2;
        else if (strValue === 5) mods.damage += 1;

        // Checkboxes (Use ?.checked)
        if (form.charging?.checked) { mods.successDie -= 1; mods.autoSkillSuccesses += 1; }
        if (form.targetCharged?.checked) mods.successDie -= 1;
        if (form.sameTarget?.checked) mods.successDie += 1;
        if (form.breakOff?.checked) mods.successDie += 1;
        if (form.natural?.checked) mods.successDie += 1;
        if (form.prone?.checked) mods.successDie += 2;

        // NEW: Read Reserved Dice Input
        mods.reservedDice = Number(form.reservedDice?.value) || 0;

        // Defense Inputs (Use ?.value)
        mods.allDice -= (Number(form.combatDef?.value) || 0);
        mods.allDice -= ((Number(form.acroDef?.value) || 0) * 2);
    }

    // --- HELPER: RANGED LOGIC ---
    async _applyRangedModifiers(item, form, mods, notes, flags) {
        const modeSelect = $(form).find('#fire-mode').find(':selected');
        const modeKey = modeSelect.val() || "single";

        const roundsUsed = parseInt(modeSelect.data("rounds")) || 1;
        const recoilPenalty = parseInt(modeSelect.data("recoil")) || 0;

        // FIX 1: Read 'ammo' directly as a number (matches your HBS partial)
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
        if (recoilPenalty > 0) {
            mods.allDice -= recoilPenalty;
            notes.push(`Recoil -${recoilPenalty}.`);
        }

        // 4. CONSUME AMMO
        const actualCost = Math.min(currentAmmo, roundsUsed);
        if (actualCost > 0) {
            // FIX 2: Update 'system.ammo' directly (Removed .value)
            await item.update({ "system.ammo": currentAmmo - actualCost });
        }

        // 5. OTHER INPUTS (Cover, Aiming, etc.)
        mods.successDie += (Number(form.cover?.value) || 0);
        mods.successDie += (Number(form.dual?.value) || 0);

        if (form.targetMoved?.checked) mods.successDie -= 1;
        if (form.blind?.checked) mods.allDice -= 1;
        if (form.prone?.checked) mods.successDie += 1;

        if (form.longRange?.checked) {
            mods.rank -= 1;
            notes.push("Long Range.");
        }

        if (modeKey !== "suppressive" && modeKey !== "suppress") {
            const aimVal = form.aiming?.value;
            if (aimVal === "sd") mods.successDie += 1;
            if (aimVal === "skill") mods.autoSkillSuccesses += 1;
        }

        return true;
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