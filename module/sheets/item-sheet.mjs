/**
 * Extend the basic ItemSheet
 * @extends {ItemSheet}
 */
import { prepareFiringModes, getLinkedDisciplineImage, enrichItemDescription } from "../helpers/item-sheet.mjs";
import { handleWeaponDrop, handleWeaponSkillDrop, handleDisciplineDrop, handleSkillDrop, handleSkillDelete } from "../helpers/drop-handlers.mjs";

// Apply HandlebarsApplicationMixin for AppV2 rendering
const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

export class SlaItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {

    /** @override */
    static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
        classes: ["sla-industries", "sheet", "item"],
        template: "systems/sla-industries/templates/item/item-sheet.hbs",
        tag: "form", // V13: Required for forms
        position: {
            width: 550,
            height: 600 // INCREASED from 480 to 600
        },
        form: {
            submitOnChange: false,
            closeOnSubmit: false // Item sheets don't close on submit
        }
    });

    /** @override */
    static TABS = {
        primary: {
            tabs: [
                { id: 'attributes', group: 'primary', label: 'Details' },
                { id: 'description', group: 'primary', label: 'Description' }
            ],
            initial: 'attributes'
        }
    };

    /** @override */
    static PARTS = {
        tabs: {
            template: "systems/sla-industries/templates/item/parts/item-tabs-nav.hbs"
        },
        attributes: {
            template: "systems/sla-industries/templates/item/parts/item-attributes-tab.hbs"
        },
        description: {
            template: "systems/sla-industries/templates/item/parts/item-description-tab.hbs"
        }
    };

    // --------------------------------------------
    //  DATA PREPARATION
    // --------------------------------------------

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        // CRITICAL FIX: Use 'this.item.system' to access runtime derived data
        // context.item (from super.getData) may not exist in V2, use this.item directly
        context.system = this.item.system;
        context.flags = this.item.flags;
        // Also ensure context.item exists for templates
        if (!context.item) {
            context.item = this.item;
        }
        
        // Ensure cssClass is set for the template
        if (!context.cssClass) {
            context.cssClass = this.constructor.DEFAULT_OPTIONS.classes.join(' ');
        }
        context.config = CONFIG.SLA;

        // Enrich description
        context.enrichedDescription = await enrichItemDescription(this.item);

        // Prepare firing modes for weapons
        if (this.item.type === "weapon") {
            context.firingModes = prepareFiringModes(this.item.system);
        }

        // Get linked discipline image for Ebb Formulas
        context.linkedDisciplineImg = getLinkedDisciplineImage(this.item);

        // Prepare tabs context for AppV2 - MUST be done early so it's available for all templates
        const tabsConfig = this.constructor.TABS?.primary;
        context.tabs = {};
        context.tabsArray = [];
        
        if (tabsConfig && tabsConfig.tabs) {
            // Create both object (for tab templates) and array (for navigation)
            for (const tab of tabsConfig.tabs) {
                const tabData = {
                    id: tab.id,
                    group: tab.group,
                    label: tab.label,
                    cssClass: tab.id === tabsConfig.initial ? 'active' : ''
                };
                context.tabs[tab.id] = tabData;
                context.tabsArray.push(tabData);
            }
        }

        return context;
    }

    // --------------------------------------------
    //  EVENT LISTENERS
    // --------------------------------------------

    /** @override */
    _onRender(context, options) {
        super._onRender(context, options);
        if (!this.isEditable) return;

        // V13: this.element is a DOM element, not a jQuery object
        const element = this.element;

        // V13: Initialize tabs manually since ApplicationV2's automatic system may not work with parts structure
        this._initializeTabs();

        // --- 1. MAGAZINE LINKING (Weapons) ---
        const weaponDropZone = element.querySelector('.weapon-link');
        if (weaponDropZone) {
            weaponDropZone.addEventListener('drop', this._onDropWeapon.bind(this));
            weaponDropZone.addEventListener('dragover', (ev) => ev.preventDefault());
        }

        // V13: Use DOM methods instead of jQuery
        element.querySelectorAll('.remove-link').forEach(button => {
            button.addEventListener('click', async ev => {
                ev.preventDefault();
                await this.item.update({ "system.linkedWeapon": "" });
            });
        });

        // --- 2. WEAPON SKILL LINKING (NEW) ---
        const weaponSkillZone = element.querySelector('.skill-link-box');
        if (weaponSkillZone) {
            // V13: Use DOM methods instead of jQuery
            weaponSkillZone.addEventListener("dragover", event => event.preventDefault());
            weaponSkillZone.addEventListener("drop", this._onDropWeaponSkill.bind(this));
        }

        element.querySelectorAll('.remove-skill-link').forEach(button => {
            button.addEventListener('click', async ev => {
                ev.preventDefault();
                await this.item.update({ "system.skill": "" });
            });
        });

        // --- 3. EBB DISCIPLINE LINKING ---
        const disciplineDropZone = element.querySelector('.discipline-drop-zone');

        // A. Drop Handler
        if (disciplineDropZone) {
            disciplineDropZone.addEventListener('drop', this._onDropDiscipline.bind(this));
            disciplineDropZone.addEventListener('dragover', (ev) => {
                ev.preventDefault();
                ev.dataTransfer.dropEffect = 'copy';
            });
        }

        // B. Delete Handler (Delegated) - V13: Use event delegation with DOM methods
        if (disciplineDropZone) {
            disciplineDropZone.addEventListener('click', async (ev) => {
                if (ev.target.closest('.remove-discipline')) {
                    ev.preventDefault();
                    ev.stopPropagation();
                    await this.item.update({ "system.discipline": "" });
                }
            });
        }

        // --- 4. SKILL GRANTING (Species & Packages) ---
        const skillDropZone = element.querySelector('.skill-grant-area');

        // A. Drop Handler - V13: Use DOM methods instead of jQuery
        if (skillDropZone) {
            skillDropZone.addEventListener("dragover", event => event.preventDefault());
            skillDropZone.addEventListener("drop", this._onDropSkill.bind(this));
        }

        // B. Delete Handler (Delegated) - V13: Use event delegation with DOM methods
        if (skillDropZone) {
            skillDropZone.addEventListener("click", (ev) => {
                if (ev.target.closest(".delete-grant")) {
                    this._onDeleteSkill(ev);
                }
            });
        }

        // --- 5. WEAPON ATTACK TYPE CHANGE (Re-render to show/hide firing modes) ---
        const attackTypeSelect = element.querySelector('select[name="system.attackType"]');
        if (attackTypeSelect) {
            attackTypeSelect.addEventListener('change', async (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                // Get the form element
                const form = ev.target.closest('form') || ev.target.form;
                if (!form) return;
                
                // Update the item with the new attackType value
                const newValue = ev.target.value;
                await this.item.update({ "system.attackType": newValue });
                
                // Re-render to show/hide firing modes panel based on new value
                await this.render();
            });
        }
    }

    /**
     * Initialize tab switching for ApplicationV2
     * @private
     */
    _initializeTabs() {
        const element = this.element;
        const tabsConfig = this.constructor.TABS?.primary;
        if (!tabsConfig) return;

        const group = tabsConfig.tabs[0]?.group || 'primary';
        const initialTab = tabsConfig.initial || tabsConfig.tabs[0]?.id;

        // Find all tab navigation links
        const tabLinks = element.querySelectorAll(`nav[data-group="${group}"] a[data-tab]`);
        
        tabLinks.forEach(link => {
            link.addEventListener('click', (ev) => {
                ev.preventDefault();
                const tabId = ev.currentTarget.dataset.tab;
                this._activateTab(tabId, group);
            });
        });

        // Activate initial tab
        if (initialTab) {
            setTimeout(() => {
                this._activateTab(initialTab, group);
            }, 50);
        }
    }

    /**
     * Activate a specific tab
     * @param {string} tabId - The ID of the tab to activate
     * @param {string} group - The tab group
     * @private
     */
    _activateTab(tabId, group) {
        const element = this.element;
        
        // Remove active class from all tabs and hide all tab content
        element.querySelectorAll(`nav[data-group="${group}"] a.item`).forEach(a => {
            a.classList.remove('active');
        });
        
        // Hide all tabs (including those nested in parts)
        element.querySelectorAll(`section[data-group="${group}"].tab`).forEach(section => {
            section.classList.remove('active');
            section.style.display = 'none';
        });

        // Activate the clicked tab link
        const tabLink = element.querySelector(`nav[data-group="${group}"] a[data-tab="${tabId}"]`);
        if (tabLink) {
            tabLink.classList.add('active');
        }

        // Show the corresponding tab content
        const tabContent = element.querySelector(`section[data-group="${group}"].tab[data-tab="${tabId}"]`);
        if (tabContent) {
            tabContent.classList.add('active');
            tabContent.style.display = 'flex';
            tabContent.style.flexDirection = 'column';
            tabContent.style.overflowY = 'auto';
            tabContent.style.overflowX = 'hidden';
        }
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