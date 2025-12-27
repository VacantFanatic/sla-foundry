/**
 * Extend the basic ItemSheet
 * @extends {ItemSheet}
 */
export class SlaItemSheet extends foundry.appv1.sheets.ItemSheet {

    /** @override */
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["sla-industries", "sheet", "item"],
            template: "systems/sla-industries/templates/item/item-sheet.hbs",
            width: 550,
            height: 600, // INCREASED from 480 to 600
            tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "attributes", group: "primary" }]
        });
    }

    // --------------------------------------------
    //  DATA PREPARATION
    // --------------------------------------------

    /** @override */
    async getData() {
        const context = await super.getData();
        const itemData = context.item;
        context.system = itemData.system;
        context.flags = itemData.flags;
        context.config = CONFIG.SLA;

        // --- 1. ENRICH DESCRIPTION (The Missing Part) ---
        context.enrichedDescription = await foundry.applications.ux.TextEditor.enrichHTML(this.item.system.description, {
            async: true,
            relativeTo: this.item
        });

        // --- 2. PREPARE FIRING MODES (Data Model -> Object) ---
        // Using toObject() ensures we work with POJOs. Explicit keys ensure iteration order.
        if (this.item.type === "weapon") {
            context.firingModes = {};
            const knownModes = ["single", "burst", "auto", "suppressive"];
            const sourceModes = this.item.system.toObject().firingModes || {};

            for (const key of knownModes) {
                if (sourceModes[key]) {
                    context.firingModes[key] = {
                        ...sourceModes[key],
                        id: key
                    };
                }
            }
        }

        // --- 3. EBB IMAGE LOOKUP ---
        if (this.item.actor && context.system.discipline) {
            const disciplineItem = this.item.actor.items.find(i =>
                i.type === "discipline" &&
                i.name.toLowerCase() === context.system.discipline.toLowerCase()
            );
            context.linkedDisciplineImg = disciplineItem ? disciplineItem.img : "icons/svg/item-bag.svg";
        } else {
            context.linkedDisciplineImg = "icons/svg/item-bag.svg";
        }

        return context;
    }

    // --------------------------------------------
    //  EVENT LISTENERS
    // --------------------------------------------

    /** @override */
    activateListeners(html) {
        super.activateListeners(html);
        if (!this.isEditable) return;

        // --- 1. MAGAZINE LINKING (Weapons) ---
        const weaponDropZone = html.find('.weapon-link');
        if (weaponDropZone.length > 0) {
            weaponDropZone[0].addEventListener('drop', this._onDropWeapon.bind(this));
            weaponDropZone[0].addEventListener('dragover', (ev) => ev.preventDefault());
        }

        html.find('.remove-link').click(async ev => {
            ev.preventDefault();
            await this.item.update({ "system.linkedWeapon": "" });
        });

        // --- 2. WEAPON SKILL LINKING (NEW) ---
        const weaponSkillZone = html.find('.skill-link-box');
        if (weaponSkillZone.length > 0) {
            // Use jQuery .on to catch originalEvent easily
            weaponSkillZone.on("dragover", event => event.preventDefault());
            weaponSkillZone.on("drop", this._onDropWeaponSkill.bind(this));
        }

        html.find('.remove-skill-link').click(async ev => {
            ev.preventDefault();
            await this.item.update({ "system.skill": "" });
        });

        // --- 3. EBB DISCIPLINE LINKING ---
        const disciplineDropZone = html.find('.discipline-drop-zone');

        // A. Drop Handler
        if (disciplineDropZone.length > 0) {
            disciplineDropZone[0].addEventListener('drop', this._onDropDiscipline.bind(this));
            disciplineDropZone[0].addEventListener('dragover', (ev) => {
                ev.preventDefault();
                ev.dataTransfer.dropEffect = 'copy';
            });
        }

        // B. Delete Handler (Delegated)
        html.find('.discipline-drop-zone').on('click', '.remove-discipline', async (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            await this.item.update({ "system.discipline": "" });
        });

        // --- 4. SKILL GRANTING (Species & Packages) ---
        const skillDropZone = html.find('.skill-grant-area');

        // A. Drop Handler (Using jQuery .on to access originalEvent)
        if (skillDropZone.length > 0) {
            skillDropZone.on("dragover", event => event.preventDefault());
            skillDropZone.on("drop", this._onDropSkill.bind(this));
        }

        // B. Delete Handler (Delegated)
        html.find('.skill-grant-area').on("click", ".delete-grant", this._onDeleteSkill.bind(this));
    }

    // --------------------------------------------
    //  DROP HANDLERS
    // --------------------------------------------

    /**
     * Handle dropping a Weapon item to link it to this Magazine
     */
    async _onDropWeapon(event) {
        event.preventDefault();
        try {
            const data = JSON.parse(event.dataTransfer.getData('text/plain'));
            if (data.type !== "Item") return;

            const item = await Item.implementation.fromDropData(data);
            if (item && item.type === "weapon") {
                await this.item.update({ "system.linkedWeapon": item.name });
                ui.notifications.info(`Linked Magazine to: ${item.name}`);
            } else {
                ui.notifications.warn("Only Weapons can be linked to a Magazine.");
            }
        } catch (err) {
            console.error("SLA | Weapon Drop Failed:", err);
        }
    }

    /**
     * Handle dropping a Skill item onto a Weapon to set requirement
     */
    async _onDropWeaponSkill(event) {
        event.preventDefault();
        try {
            const data = JSON.parse(event.originalEvent.dataTransfer.getData('text/plain'));
            if (data.type !== "Item") return;

            const item = await Item.implementation.fromDropData(data);

            // Validation: Must be a Skill
            if (!item || item.type !== "skill") {
                return ui.notifications.warn("Only 'Skill' items can be linked.");
            }

            // Save the NAME of the skill (e.g., "Pistol", "Melee")
            await this.item.update({
                "system.skill": item.name
            });

        } catch (err) {
            console.error("SLA | Weapon Skill Drop Failed:", err);
        }
    }

    /**
     * Handle dropping a Discipline item onto an Ebb Formula
     */
    async _onDropDiscipline(event) {
        event.preventDefault();
        event.stopPropagation();

        try {
            const data = JSON.parse(event.dataTransfer.getData('text/plain'));
            if (data.type !== "Item") return;

            const item = await Item.implementation.fromDropData(data);

            if (!item || item.type !== "discipline") {
                return ui.notifications.warn("Only 'Discipline' items can be linked here.");
            }

            await this.item.update({
                "system.discipline": item.name
            });

        } catch (err) {
            console.error("SLA | Discipline Drop Failed:", err);
        }
    }

    /**
     * Handle dropping a Skill onto Species/Package (Creates List)
     */
    async _onDropSkill(event) {
        event.preventDefault();
        try {
            // jQuery wraps the event, so we need originalEvent for dataTransfer
            const data = JSON.parse(event.originalEvent.dataTransfer.getData('text/plain'));
            if (data.type !== "Item") return;

            const item = await Item.implementation.fromDropData(data);

            // Validation
            if (!item || item.type !== "skill") {
                return ui.notifications.warn("Only Skills can be added to this list.");
            }

            // 1. Get the current list (safely)
            let currentSkills = this.item.system.skills;
            if (!Array.isArray(currentSkills)) {
                currentSkills = [];
            }

            // MIGRATION: Fix any strings OR objects missing 'stat'
            // If the user previously had an array of strings, we convert them now to avoid validation errors
            const cleanSkills = currentSkills.map(s => {
                if (typeof s === "string") {
                    return {
                        name: s,
                        rank: 1,
                        img: "icons/svg/item-bag.svg",
                        stat: "dex"
                    };
                }
                // Also ensure existing objects have stat
                if (!s.stat) s.stat = "dex";
                return s;
            });

            // 2. Build the data object
            const newSkill = {
                name: item.name,
                rank: item.system.rank || 1,
                img: item.img || "icons/svg/item-bag.svg",
                stat: item.system.stat || "dex"
            };

            // 3. Check for duplicates
            if (cleanSkills.some(s => s.name === newSkill.name)) {
                return ui.notifications.warn(`${newSkill.name} is already in the list.`);
            }

            // 4. Update the Item
            const newArray = [...cleanSkills, newSkill];
            await this.item.update({ "system.skills": newArray });

        } catch (err) {
            console.error("SLA | Skill Drop Failed:", err);
        }
    }

    /**
     * Handle deleting a skill from the Species/Package list
     */
    async _onDeleteSkill(event) {
        event.preventDefault();
        const target = event.currentTarget;
        const index = Number(target.dataset.index);

        const currentSkills = this.item.system.skills || [];

        // Filter out the specific index AND sanitize remainder
        const newArray = currentSkills
            .filter((_, i) => i !== index)
            .map(s => {
                if (typeof s === "string") return { name: s, rank: 1, img: "icons/svg/item-bag.svg" };
                return s;
            });

        await this.item.update({ "system.skills": newArray });
    }
}