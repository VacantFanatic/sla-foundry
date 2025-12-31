/**
 * Extend the basic ItemSheet
 * @extends {ItemSheet}
 */
import { prepareFiringModes, getLinkedDisciplineImage, enrichItemDescription } from "../helpers/item-sheet.mjs";
import { handleWeaponDrop, handleWeaponSkillDrop, handleDisciplineDrop, handleSkillDrop, handleSkillDelete } from "../helpers/drop-handlers.mjs";

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

        // Enrich description
        context.enrichedDescription = await enrichItemDescription(this.item);

        // Prepare firing modes for weapons
        if (this.item.type === "weapon") {
            context.firingModes = prepareFiringModes(this.item.system);
        }

        // Get linked discipline image for Ebb Formulas
        context.linkedDisciplineImg = getLinkedDisciplineImage(this.item);

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
        await handleWeaponDrop(event, this.item);
    }

    /**
     * Handle dropping a Skill item onto a Weapon to set requirement
     */
    async _onDropWeaponSkill(event) {
        await handleWeaponSkillDrop(event, this.item);
    }

    /**
     * Handle dropping a Discipline item onto an Ebb Formula
     */
    async _onDropDiscipline(event) {
        await handleDisciplineDrop(event, this.item);
    }

    /**
     * Handle dropping a Skill onto Species/Package (Creates List)
     */
    async _onDropSkill(event) {
        await handleSkillDrop(event, this.item);
    }

    /**
     * Handle deleting a skill from the Species/Package list
     */
    async _onDeleteSkill(event) {
        event.preventDefault();
        const index = Number(event.currentTarget.dataset.index);
        await handleSkillDelete(index, this.item);
    }
}