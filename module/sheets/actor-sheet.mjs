/**
 * Extend the basic ActorSheet
 * @extends {ActorSheet}
 */
import { LuckDialog } from "../apps/luck-dialog.mjs";
import { ConfirmDialog } from "../apps/confirm-dialog.mjs";
import { AttackDialog } from "../apps/attack-dialog.mjs";
import { calculateRollResult, generateDiceTooltip, createSLARoll } from "../helpers/dice.mjs";
import { prepareItems } from "../helpers/items.mjs";
import { applyMeleeModifiers, applyRangedModifiers, calculateRangePenalty } from "../helpers/modifiers.mjs";

// Apply HandlebarsApplicationMixin for AppV2 rendering
const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

export class SlaActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

    /** @override */
    static get defaultOptions() {
        const parentOptions = super.defaultOptions || {};
        // Merge classes arrays properly - combine parent classes with our own
        const parentClasses = Array.isArray(parentOptions.classes) ? parentOptions.classes : [];
        const mergedClasses = [...new Set([...parentClasses, "sla-industries", "sla-sheet", "sheet", "actor"])];
        
        // Ensure window options are properly merged (not replaced)
        const parentWindow = parentOptions.window || {};
        const mergedWindow = foundry.utils.mergeObject(parentWindow, {
            resizable: true
        });
        
        return foundry.utils.mergeObject(parentOptions, {
            classes: mergedClasses,
            template: "systems/sla-industries/templates/actor/actor-sheet.hbs",
            tag: "form", // V13: Required for forms
            position: {
                width: 800,
                height: 950
            },
            window: mergedWindow,
            form: {
                submitOnChange: false,
                closeOnSubmit: false // Actor sheets don't close on submit
            }
        });
    }

    /** @override */
    static TABS = {
        sheet: {
            tabs: [
                { id: 'main', group: 'sheet', label: 'Main' },
                { id: 'ebb', group: 'sheet', label: 'Combat' },
                { id: 'inventory', group: 'sheet', label: 'Inventory' },
                { id: 'biography', group: 'sheet', label: 'Bio & Traits' }
            ],
            initial: 'main'
        }
    };

    /** @override */
    static PARTS = {
        header: {
            template: "systems/sla-industries/templates/actor/parts/header-card.hbs"
        },
        tabs: {
            template: "systems/sla-industries/templates/actor/parts/tabs-nav.hbs"
        },
        main: {
            template: "systems/sla-industries/templates/actor/parts/main-tab.hbs"
        },
        ebb: {
            template: "systems/sla-industries/templates/actor/parts/combat-tab.hbs"
        },
        inventory: {
            template: "systems/sla-industries/templates/actor/parts/inventory-tab.hbs"
        },
        biography: {
            template: "systems/sla-industries/templates/actor/parts/bio-traits-tab.hbs"
        }
    };

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
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        // CRITICAL FIX: Use 'this.actor.system' to access runtime derived data (like .total)
        // context.data (from super.getData) only contains the database properties in some versions.
        context.system = this.actor.system;
        context.flags = this.actor.flags;
        
        // Ensure cssClass is set for the template
        if (!context.cssClass) {
            context.cssClass = this.constructor.defaultOptions.classes.join(' ');
        }

        // Prepare tabs context for AppV2 - MUST be done early so it's available for all templates
        // ALWAYS use the current active tab, never default to "main"
        let activeTabId = null;
        
        // Priority 1: Use preserved tab state (set before render)
        if (this._preservedTab) {
            activeTabId = this._preservedTab.activeTab;
        }
        // Priority 2: Get current tab from DOM if available
        else if (this.element) {
            const activeTabLink = this.element.querySelector('nav[data-group="sheet"] a.item.active');
            activeTabId = activeTabLink?.dataset.tab || null;
        }
        // Priority 3: Only use config default if this is truly the first render
        // But we'll try to avoid this by preserving tab state in render()
        const tabsConfig = this.constructor.TABS?.sheet;
        const defaultTabId = tabsConfig?.initial || 'main';
        
        // Use active tab if we found one, otherwise use default (only on first render)
        const initialTabId = activeTabId || defaultTabId;
        
        context.tabs = {};
        context.tabsArray = [];
        
        if (tabsConfig && tabsConfig.tabs) {
            // Create both object (for tab templates) and array (for navigation)
            for (const tab of tabsConfig.tabs) {
                const tabData = {
                    id: tab.id,
                    group: tab.group,
                    label: tab.label,
                    cssClass: tab.id === initialTabId ? 'active' : ''
                };
                context.tabs[tab.id] = tabData;
                context.tabsArray.push(tabData);
            }
        }
        
        // Always ensure we have at least the fallback tabs
        if (context.tabsArray.length === 0) {
            context.tabsArray = [
                { id: 'main', group: 'sheet', label: 'Main', cssClass: initialTabId === 'main' ? 'active' : '' },
                { id: 'ebb', group: 'sheet', label: 'Combat', cssClass: initialTabId === 'ebb' ? 'active' : '' },
                { id: 'inventory', group: 'sheet', label: 'Inventory', cssClass: initialTabId === 'inventory' ? 'active' : '' },
                { id: 'biography', group: 'sheet', label: 'Bio & Traits', cssClass: initialTabId === 'biography' ? 'active' : '' }
            ];
            // Also populate the tabs object
            for (const tab of context.tabsArray) {
                context.tabs[tab.id] = tab;
            }
        }

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

        // In AppV2, context.actor might not exist, use this.actor directly
        context.actor = context.actor || this.actor;
        context.rollData = this.actor.getRollData();

        // Ensure context.items exists and is an array BEFORE calling _prepareItems
        // In AppV2, items might be a Collection, convert to array if needed
        const itemsCollection = context.items || this.actor.items;
        context.items = Array.isArray(itemsCollection) ? itemsCollection : Array.from(itemsCollection || []);

        if (this.actor.type == 'character' || this.actor.type == 'npc') {
            this._prepareItems(context);
        }

        // ... (Keep existing speciesList logic) ...

        // Use the array version of items for finding species/package
        const itemsArray = Array.isArray(context.items) ? context.items : Array.from(this.actor.items || []);
        context.speciesItem = itemsArray.find(i => i.type === "species");
        context.packageItem = itemsArray.find(i => i.type === "package");

        // --- CHECK IF EBONITE ---
        if (context.speciesItem && context.speciesItem.name) {
            context.isEbonite = context.speciesItem.name.toLowerCase().includes("ebonite");
        } else {
            context.isEbonite = false;
        }

        context.enrichedBiography = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
            this.actor.system.biography,
            { secrets: this.actor.isOwner, relativeTo: this.actor }
        );
        context.enrichedAppearance = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
            this.actor.system.appearance,
            { secrets: this.actor.isOwner, relativeTo: this.actor }
        );
        context.enrichedNotes = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
            this.actor.system.notes,
            { secrets: this.actor.isOwner, relativeTo: this.actor }
        );

        return context;
    }

    _prepareItems(context) {
        // Use the helper function to prepare items
        // Ensure items is an array (Collections need to be converted)
        const itemsArray = Array.isArray(context.items) 
            ? context.items 
            : (context.items ? Array.from(context.items) : []);
        const itemData = prepareItems(itemsArray, context.rollData);
        
        // Assign to context
        Object.assign(context, itemData);
    }

    /* -------------------------------------------- */
    /* EVENT LISTENERS                              */
    /* -------------------------------------------- */

    /** @override */
    async render(force = false, options = {}) {
        // ALWAYS preserve current tab state before rendering
        // This ensures _prepareContext uses the current tab, not "main"
        let activeTab = null;
        let navGroup = 'sheet';
        
        if (this._preservedTab) {
            // Use preserved tab state (set by event handlers)
            activeTab = this._preservedTab.activeTab;
            navGroup = this._preservedTab.navGroup;
        } else if (this.element) {
            // Try to get current tab state from DOM
            const activeTabLink = this.element.querySelector('nav[data-group="sheet"] a.item.active');
            activeTab = activeTabLink?.dataset.tab || null;
            navGroup = activeTabLink?.closest('nav')?.dataset.group || 'sheet';
        }
        
        // ALWAYS store tab state for _prepareContext to use
        // This ensures the template renders with the correct tab active from the start
        // Only set if we don't already have a preserved tab (to respect event handler settings)
        if (activeTab && !this._preservedTab) {
            this._preservedTab = { activeTab, navGroup };
        }
        
        // Render the sheet
        const result = await super.render(force, options);
        
        // Ensure window size and resizable state are set correctly
        // In Foundry VTT V2, the window is accessed via this.window (not this.app.window)
        if (this.window && this.element) {
            // Set default width/height - always set on force render to ensure defaults are applied
            const defaultWidth = this.constructor.defaultOptions.position?.width || 800;
            const defaultHeight = this.constructor.defaultOptions.position?.height || 950;
            
            const currentWidth = this.element.offsetWidth || this.window.position?.width || 0;
            
            // Set default size if this is a forced render (new window) or if width is the old default (600)
            if (force || currentWidth === 600 || currentWidth < 100) {
                this.setPosition({ width: defaultWidth, height: defaultHeight });
            }
            
            // Enable CSS resize as a fallback - use 'both' to allow resizing from bottom-right corner
            // This provides browser-native resize functionality
            if (this.element) {
                this.element.style.setProperty('resize', 'both', 'important');
                this.element.style.setProperty('overflow', 'auto', 'important');
            }
            
            // Ensure resizable is enabled - window.resize might be null initially
            // In Foundry VTT V2, the resize system might need to be initialized
            const windowOptions = this.constructor.defaultOptions.window || {};
            if (windowOptions.resizable !== false) {
                // Try multiple approaches to enable Foundry's resize system
                if (this.window?.resize) {
                    this.window.resize.enabled = true;
                }
                // Also try setting it after delays to allow window to fully initialize
                setTimeout(() => {
                    if (this.window?.resize) {
                        this.window.resize.enabled = true;
                    }
                    // Ensure CSS resize is still enabled
                    if (this.element) {
                        this.element.style.setProperty('resize', 'both', 'important');
                        this.element.style.setProperty('overflow', 'auto', 'important');
                    }
                }, 50);
                setTimeout(() => {
                    if (this.window?.resize) {
                        this.window.resize.enabled = true;
                    }
                    if (this.element) {
                        this.element.style.setProperty('resize', 'both', 'important');
                        this.element.style.setProperty('overflow', 'auto', 'important');
                    }
                }, 200);
            }
        }
        
        // If we had an active tab and this wasn't an initial render, verify it's still correct
        // Since _prepareContext now sets the correct tab in the template, we only need to verify
        if (activeTab && this.rendered && !options._initialRender) {
            // Just verify the tab is correct (should already be from template, but double-check)
            requestAnimationFrame(() => {
                this._restoreTabState(activeTab, navGroup);
            });
        }
        
        // DON'T clear preserved tab - keep it persistent across all renders
        // This ensures _prepareContext always uses the current tab, not "main"
        // The tab will only be cleared on forced renders (new window) or when explicitly changed
        // This prevents the tab from reverting to "main" on every update
        
        return result;
    }

    /** @override */
    async _onClose(options) {
        // CRITICAL: Before closing, ensure luck and HP values are saved if they were modified
        if (this.element && this.isEditable) {
            const luckInput = this.element.querySelector('input[name="system.stats.luck.value"]');
            if (luckInput) {
                const value = luckInput.value;
                if (value !== '' && value !== null && value !== undefined) {
                    const numValue = Number(value);
                    if (!isNaN(numValue)) {
                        // Save luck value before closing
                        await this.actor.update({ "system.stats.luck.value": numValue }, { render: false });
                    }
                }
            }
            
            // Also save HP value before closing
            const hpInput = this.element.querySelector('input[name="system.hp.value"]');
            if (hpInput) {
                const value = hpInput.value;
                // Only save if the value is actually different from current and is valid
                const currentHP = this.actor.system.hp.value || 0;
                if (value !== '' && value !== null && value !== undefined) {
                    const numValue = Number(value);
                    if (!isNaN(numValue) && numValue !== currentHP) {
                        // Save HP value before closing (will be clamped by _preUpdate)
                        // Use a small delay to ensure any pending updates are processed first
                        await this.actor.update({ "system.hp.value": numValue }, { render: false });
                    }
                }
            }
        }
        return super._onClose(options);
    }

    /** @override */
    _onRender(context, options) {
        super._onRender(context, options);
        
        // CRITICAL: Ensure classes are applied to the window element
        // In Foundry VTT V2, the form element (this.element) IS the window
        // Enable CSS resize as a fallback to allow resizing
        if (this.element) {
            // Enable CSS resize to allow browser-native resizing from bottom-right corner
            // Use multiple attempts to ensure it sticks (Foundry might override it)
            const enableResize = () => {
                if (this.element) {
                    this.element.style.setProperty('resize', 'both', 'important');
                    this.element.style.setProperty('overflow', 'auto', 'important');
                }
            };
            
            // Apply immediately
            enableResize();
            
            // Also apply after delays to ensure it persists
            setTimeout(enableResize, 50);
            setTimeout(enableResize, 200);
            setTimeout(enableResize, 500);
        }
        
        // Ensure window resizable state is set
        const windowOptions = this.constructor.defaultOptions.window || {};
        if (windowOptions.resizable !== false) {
            // Try to enable resize - window.resize might not be initialized yet
            if (this.window?.resize) {
                this.window.resize.enabled = true;
            } else {
                // Set it after delays to allow window to initialize
                setTimeout(() => {
                    if (this.window?.resize) {
                        this.window.resize.enabled = true;
                    }
                }, 100);
                setTimeout(() => {
                    if (this.window?.resize) {
                        this.window.resize.enabled = true;
                    }
                }, 500);
            }
        }
        
        // Ensure classes are on the form element (this.element) - this IS the window in V2
        if (this.element) {
            const requiredClasses = this.constructor.defaultOptions.classes || [];
            requiredClasses.forEach(cls => {
                if (!this.element.classList.contains(cls)) {
                    this.element.classList.add(cls);
                }
            });
        }
        
        // Also ensure classes are on the form element (this.element) as a fallback
        if (this.element) {
            const requiredClasses = this.constructor.defaultOptions.classes || [];
            requiredClasses.forEach(cls => {
                if (!this.element.classList.contains(cls)) {
                    this.element.classList.add(cls);
                }
            });
        }
        
        if (!this.isEditable) return;

        // V13: this.element is a DOM element, not a jQuery object
        const element = this.element;
        
        // V13: Initialize tabs manually since ApplicationV2's automatic system may not work with parts structure
        this._initializeTabs();
        
        // Attach compendium listeners after a short delay to ensure all parts are rendered
        setTimeout(() => this._attachCompendiumListeners(), 100);
        
        // CRITICAL: Add blur handler for luck input to save value when user leaves the field
        const luckInput = element.querySelector('input[name="system.stats.luck.value"]');
        if (luckInput && !luckInput._blurHandlerAttached) {
            luckInput._blurHandlerAttached = true;
            luckInput.addEventListener('blur', async (ev) => {
                const value = ev.target.value;
                if (value !== '' && value !== null && value !== undefined) {
                    const numValue = Number(value);
                    if (!isNaN(numValue)) {
                        // Save luck value when input loses focus
                        await this.actor.update({ "system.stats.luck.value": numValue }, { render: false });
                    }
                }
            });
        }
        
        // CRITICAL: Add blur handler for HP input to save value when user leaves the field
        const hpInput = element.querySelector('input[name="system.hp.value"]');
        if (hpInput && !hpInput._blurHandlerAttached) {
            hpInput._blurHandlerAttached = true;
            hpInput.addEventListener('blur', async (ev) => {
                const value = ev.target.value;
                if (value !== '' && value !== null && value !== undefined) {
                    const numValue = Number(value);
                    if (!isNaN(numValue)) {
                        // Save HP value when input loses focus (will be clamped by _preUpdate)
                        await this.actor.update({ "system.hp.value": numValue }, { render: false, _preserveTab: true });
                        // Sync input with actual actor value (in case it was clamped)
                        ev.target.value = this.actor.system.hp.value;
                    }
                }
            });
        }
        
        // CRITICAL: Use event delegation at the element level with capture phase for delete buttons
        // This ensures delete handlers fire BEFORE any other handlers
        if (!element._deleteHandlerAttached) {
            element._deleteHandlerAttached = true;
            element.addEventListener('click', async (ev) => {
                const target = ev.target;
                // Check if this is a delete button click
                const deleteButton = target.closest('.chip-delete') || 
                                    target.closest('.item-delete') ||
                                    (target.classList.contains('chip-delete') && target) ||
                                    (target.classList.contains('item-delete') && target) ||
                                    (target.closest('a.chip-delete')) ||
                                    (target.closest('a.item-delete')) ||
                                    (target.closest('i.fa-trash')?.closest('.item-delete')) ||
                                    (target.closest('i.fa-times')?.closest('.chip-delete'));
                
                if (deleteButton) {
                    ev.preventDefault();
                    ev.stopPropagation();
                    ev.stopImmediatePropagation();
                    
                    console.log("DELEGATED DELETE HANDLER FIRED", {
                        target: target,
                        deleteButton: deleteButton,
                        type: deleteButton.dataset?.type
                    });
                    
                    // Handle species delete
                    if (deleteButton.classList.contains('chip-delete') && deleteButton.dataset.type === 'species') {
                        const speciesItem = this.actor.items.find(i => i.type === "species");
                        if (!speciesItem) return;
                        
                        await ConfirmDialog.confirm({
                            title: "Remove Species?",
                            content: `<p>Remove <strong>${speciesItem.name}</strong>?</p>`,
                            yes: async () => {
                                const skillsToDelete = this.actor.items
                                    .filter(i => i.getFlag("sla-industries", "fromSpecies"))
                                    .map(i => i.id);
                                await this.actor.deleteEmbeddedDocuments("Item", [speciesItem.id, ...skillsToDelete], { render: false });
                                const resets = { "system.bio.species": "" };
                                ["str", "dex", "know", "conc", "cha", "cool"].forEach(k => resets[`system.stats.${k}.value`] = 1);
                                await this.actor.update(resets);
                            }
                        });
                        return;
                    }
                    
                    // Handle package delete
                    if (deleteButton.classList.contains('chip-delete') && deleteButton.dataset.type === 'package') {
                        const packageItem = this.actor.items.find(i => i.type === "package");
                        if (!packageItem) return;
                        
                        await ConfirmDialog.confirm({
                            title: "Remove Package?",
                            content: `<p>Remove <strong>${packageItem.name}</strong>?</p>`,
                            yes: async () => {
                                const skillsToDelete = this.actor.items
                                    .filter(i => i.getFlag("sla-industries", "fromPackage"))
                                    .map(i => i.id);
                                await this.actor.deleteEmbeddedDocuments("Item", [packageItem.id, ...skillsToDelete], { render: false });
                                await this.actor.update({ "system.bio.package": "" });
                            }
                        });
                        return;
                    }
                    
                    // Handle item delete
                    if (deleteButton.classList.contains('item-delete') || deleteButton.closest('.item-delete')) {
                        const li = deleteButton.closest(".item");
                        if (!li) return;
                        const item = this.actor.items.get(li.dataset.itemId);
                        if (item) {
                            await ConfirmDialog.confirm({ 
                                title: "Delete Item?", 
                                content: "<p>Are you sure?</p>", 
                                yes: async () => { 
                                    await item.delete(); 
                                    this.render();
                                } 
                            });
                        }
                        return;
                    }
                }
            }, true); // Capture phase - fires FIRST
        }

        // --- HEADER DELETE (SPECIES) ---
        // V13: Use DOM methods instead of jQuery
        // IMPORTANT: Register this BEFORE rollable handlers to prevent event bubbling
        element.querySelectorAll('.chip-delete[data-type="species"]').forEach(button => {
            // Remove any existing listeners first
            const newButton = button.cloneNode(true);
            button.parentNode.replaceChild(newButton, button);
            
            newButton.addEventListener('click', async ev => {
                ev.preventDefault(); 
                ev.stopPropagation();
                ev.stopImmediatePropagation(); // Prevent other handlers from firing
                
                // Additional safety check
                if (!ev.target.closest('.chip-delete[data-type="species"]')) {
                    return;
                }
                
                const speciesItem = this.actor.items.find(i => i.type === "species");
                if (!speciesItem) return;

                await ConfirmDialog.confirm({
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
            }, true); // Use capture phase to ensure this fires first
        });

        // DRUG USE ICON - V13: Use DOM methods
        element.querySelectorAll('.item-use-drug').forEach(button => {
            button.addEventListener('click', async ev => {
                ev.preventDefault();
                // V13: Use DOM traversal instead of jQuery
                const li = ev.currentTarget.closest(".item");
                if (!li) return;
                const itemId = li.dataset.itemId;
                const item = this.actor.items.get(itemId);

                if (!item || item.type !== "drug") return;

                const currentQty = item.system.quantity || 0;

                // Safety check
                if (currentQty <= 0) {
                    // If it's 0, just delete it immediately to clean up
                    return item.delete();
                }

                const newQty = currentQty - 1;

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
        });

        // --- HEADER DELETE (PACKAGE) ---
        // V13: Use DOM methods instead of jQuery
        // IMPORTANT: Register this BEFORE rollable handlers to prevent event bubbling
        element.querySelectorAll('.chip-delete[data-type="package"]').forEach(button => {
            // Remove any existing listeners first
            const newButton = button.cloneNode(true);
            button.parentNode.replaceChild(newButton, button);
            
            newButton.addEventListener('click', async ev => {
                ev.preventDefault(); 
                ev.stopPropagation();
                ev.stopImmediatePropagation(); // Prevent other handlers from firing
                
                // Additional safety check
                if (!ev.target.closest('.chip-delete[data-type="package"]')) {
                    return;
                }
                
                const packageItem = this.actor.items.find(i => i.type === "package");
                if (!packageItem) return;

                await ConfirmDialog.confirm({
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
            }, true); // Use capture phase to ensure this fires first
        });

        // --- INLINE ITEM EDITING ---
        // V13: Use DOM methods instead of jQuery
        element.querySelectorAll('.inline-edit').forEach(input => {
            input.addEventListener('change', async ev => {
                ev.preventDefault();
                const itemId = input.dataset.itemId || input.closest(".item")?.dataset.itemId;
                if (!itemId) return;

                const item = this.actor.items.get(itemId);
                const field = input.dataset.field;

                if (item && field) {
                    await item.update({ [field]: Number(input.value) });
                }
            });
        });

        // --- ITEM EDIT & DELETE (Register BEFORE rollable to prevent conflicts) ---
        // Use event delegation to handle clicks on item-edit buttons (including icons inside them)
        element.addEventListener('click', (ev) => {
            // Check if the click is on an item-edit button or its icon
            const editButton = ev.target.closest('.item-edit');
            if (!editButton) return;
            
            ev.preventDefault();
            ev.stopPropagation();
            ev.stopImmediatePropagation();
            
            // Find the item row
            const itemRow = editButton.closest(".item");
            if (!itemRow) return;
            
            const itemId = itemRow.dataset.itemId;
            if (!itemId) return;
            
            const item = this.actor.items.get(itemId);
            if (item) {
                item.sheet.render(true);
            }
        }, true); // Use capture phase to ensure this fires first

        element.querySelectorAll('.item-delete').forEach(button => {
            // Clone button to remove any existing listeners
            const newButton = button.cloneNode(true);
            button.parentNode.replaceChild(newButton, button);
            
            newButton.addEventListener('click', async ev => {
                // CRITICAL: Stop everything immediately
                ev.preventDefault();
                ev.stopPropagation();
                ev.stopImmediatePropagation();
                
                // Verify we're actually clicking on a delete button
                const clickedElement = ev.target;
                if (!clickedElement.closest('.item-delete') && 
                    !clickedElement.classList.contains('item-delete') &&
                    !clickedElement.closest('a.item-delete')) {
                    return;
                }
                
                const li = ev.currentTarget.closest(".item");
                if (!li) return;
                const item = this.actor.items.get(li.dataset.itemId);
                if (item) {
                    await ConfirmDialog.confirm({ 
                        title: "Delete Item?", 
                        content: "<p>Are you sure?</p>", 
                        yes: async () => { 
                            await item.delete(); 
                            this.render();
                        } 
                    });
                }
            }, true); // Use capture phase to fire FIRST
        });

        element.querySelectorAll('.item-toggle').forEach(button => {
            button.addEventListener('click', async ev => {
                const li = ev.currentTarget.closest(".item");
                if (!li) return;
                const item = this.actor.items.get(li.dataset.itemId);
                if (item) {
                    // Store current active tab before update
                    const activeTabLink = this.element.querySelector('nav[data-group="sheet"] a.item.active');
                    const activeTab = activeTabLink?.dataset.tab || 'main';
                    const navGroup = activeTabLink?.closest('nav')?.dataset.group || 'sheet';
                    this._preservedTab = { activeTab, navGroup };
                    
                    if (item.type === 'drug') {
                        await item.toggleActive();
                    } else {
                        await item.update({ "system.equipped": !item.system.equipped });
                        // If armor was toggled, force recalculation of PV and derived data
                        if (item.type === 'armor') {
                            // Force prepareDerivedData to recalculate PV
                            this.actor.prepareDerivedData();
                        }
                    }
                    
                    // Restore tab state after update
                    this._restoreTabState(activeTab, navGroup);
                    requestAnimationFrame(() => this._restoreTabState(activeTab, navGroup));
                    setTimeout(() => this._restoreTabState(activeTab, navGroup), 50);
                }
            });
        });

        // --- NEW: Rollable Icon Listener ---
        element.querySelectorAll('.item-rollable').forEach(button => {
            button.addEventListener('click', ev => {
                // CRITICAL: Check the actual clicked element first
                const clickedElement = ev.target;
                const currentTarget = ev.currentTarget;
                
                // Check if the click originated from or is inside a delete/edit button
                // Check both the target and currentTarget, and also check the event path
                const isDeleteButton = clickedElement.closest('.chip-delete') || 
                                       clickedElement.closest('.item-delete') || 
                                       clickedElement.closest('.item-edit') ||
                                       currentTarget.closest('.chip-delete') ||
                                       currentTarget.closest('.item-delete') ||
                                       currentTarget.closest('.item-edit') ||
                                       clickedElement.classList.contains('chip-delete') ||
                                       clickedElement.classList.contains('item-delete') ||
                                       clickedElement.classList.contains('item-edit') ||
                                       clickedElement.closest('a.chip-delete') ||
                                       clickedElement.closest('a.item-delete') ||
                                       clickedElement.closest('a.item-edit') ||
                                       (ev.composedPath && ev.composedPath().some(el => 
                                           el.classList?.contains('chip-delete') || 
                                           el.classList?.contains('item-delete') || 
                                           el.classList?.contains('item-edit')
                                       ));
                
                if (isDeleteButton) {
                    ev.preventDefault();
                    ev.stopPropagation();
                    ev.stopImmediatePropagation();
                    return;
                }
                this._onRoll(ev);
            }, false); // Use bubble phase so delete handlers (capture) fire first
        });

        element.querySelectorAll('.item-reload').forEach(button => {
            button.addEventListener('click', ev => this._onReloadWeapon(ev));
        });

        element.querySelectorAll('.item-create').forEach(button => {
            button.addEventListener('click', ev => this._onItemCreate(ev));
        });

        // Use event delegation for rollable clicks to handle dynamically added elements
        if (!element._rollableHandlerAttached) {
            element._rollableHandlerAttached = true;
            element.addEventListener('click', ev => {
                // Check if the click target is a rollable element or inside one
                const rollableElement = ev.target.closest('.rollable');
                if (!rollableElement) return; // Not a rollable element, ignore
                
                // Skip if this element has .item-rollable (handled by specific listener above)
                if (rollableElement.classList.contains('item-rollable')) {
                    return; // Let the specific handler take care of it
                }
                
                // Set currentTarget to the rollable element for consistency
                const currentTarget = rollableElement;
                const clickedElement = ev.target;
                
                // CRITICAL: Check event path FIRST - if ANY element in the path is a delete/edit button, abort immediately
                // BUT allow rollable elements even if they're in item-controls
                const path = ev.composedPath ? ev.composedPath() : [];
                const isRollableClick = currentTarget.classList.contains('rollable');
                
                const hasDeleteInPath = path.some(el => {
                    if (!el || !el.classList) return false;
                    // Don't block if this is a rollable element inside item-controls
                    if (el.classList.contains('item-controls') && isRollableClick) {
                        return false;
                    }
                    return el.classList.contains('chip-delete') || 
                           el.classList.contains('item-delete') || 
                           el.classList.contains('item-edit') ||
                           (el.tagName === 'A' && (el.classList.contains('item-delete') || el.classList.contains('item-edit'))) ||
                           (el.tagName === 'I' && (el.classList.contains('fa-trash') || el.classList.contains('fa-times')));
                });
                
                if (hasDeleteInPath) {
                    ev.preventDefault();
                    ev.stopPropagation();
                    ev.stopImmediatePropagation();
                    return;
                }
                
                // CRITICAL: Check if click originated from item-controls cell (where delete buttons are)
                // This must be checked BEFORE any other logic
                // BUT allow rollable elements (like attack icons) to work even if they're in item-controls
                const itemControlsCell = clickedElement.closest('.item-controls');
                if (itemControlsCell) {
                    // Check if this is a rollable element (attack icon, etc.) - if so, allow it
                    const isRollableInControls = clickedElement.closest('.rollable') || currentTarget.classList.contains('rollable');
                    if (!isRollableInControls) {
                        // It's in item-controls but not a rollable, so abort (e.g., delete/edit buttons)
                        ev.preventDefault();
                        ev.stopPropagation();
                        ev.stopImmediatePropagation();
                        return;
                    }
                }
                
                // Check if the click originated from or is inside a delete/edit button
                const isDeleteButton = clickedElement.closest('.chip-delete') || 
                                       clickedElement.closest('.item-delete') || 
                                       clickedElement.closest('.item-edit') ||
                                       clickedElement.classList.contains('chip-delete') ||
                                       clickedElement.classList.contains('item-delete') ||
                                       clickedElement.classList.contains('item-edit') ||
                                       clickedElement.closest('a.chip-delete') ||
                                       clickedElement.closest('a.item-delete') ||
                                       clickedElement.closest('a.item-edit') ||
                                       clickedElement.closest('i.fa-trash') ||
                                       clickedElement.closest('i.fa-times');
                
                if (isDeleteButton) {
                    ev.preventDefault();
                    ev.stopPropagation();
                    ev.stopImmediatePropagation();
                    return;
                }
                
                // CRITICAL: Only process if the click is actually on the rollable element itself or its direct children
                // If the click is on a different cell (like the delete button cell), ignore it
                // The currentTarget is the rollable element (e.g., the <td class="item-name rollable">)
                // The clickedElement might be a child of currentTarget (like text node) or a sibling (like delete button)
                // We only want to proceed if the click is directly on the rollable element or its intended children
                
                // If clickedElement is not currentTarget, check if it's a descendant
                // If not, it's a sibling or other element - don't process
                if (currentTarget !== clickedElement && !currentTarget.contains(clickedElement)) {
                    // Click is on a sibling or other element, not on the rollable element
                    // This prevents clicks on adjacent cells (like item-controls) from triggering rolls
                    return;
                }
                
                // Double-check: if the clicked element or any ancestor is in item-controls, abort
                // BUT allow rollable elements (like attack icons) to work even if they're in item-controls
                const inItemControls = clickedElement.closest('.item-controls') || currentTarget.closest('.item-controls');
                if (inItemControls) {
                    // Check if this is a rollable element (attack icon, etc.) - if so, allow it
                    const isRollableInControls = clickedElement.closest('.rollable') || currentTarget.classList.contains('rollable');
                    if (!isRollableInControls) {
                        // It's in item-controls but not a rollable, so abort (e.g., delete/edit buttons)
                        return;
                    }
                }
                
                // Create a synthetic event object with the rollable element as currentTarget
                // Use a Proxy to preserve all event methods while overriding currentTarget and target
                const syntheticEv = new Proxy(ev, {
                    get(target, prop) {
                        if (prop === 'currentTarget') return currentTarget;
                        if (prop === 'target') return clickedElement;
                        // For all other properties/methods, use the original event
                        const value = target[prop];
                        // If it's a function, bind it to the original event
                        return typeof value === 'function' ? value.bind(target) : value;
                    }
                });
                
                // Stop propagation to prevent other handlers from firing
                ev.stopPropagation();
                ev.stopImmediatePropagation();
                
                this._onRoll(syntheticEv);
            }, false); // Use bubble phase so delete handlers (capture) fire first
        }

        // --- CONDITIONS TOGGLE ---
        // V13: Use DOM methods instead of jQuery
        // Use event delegation to handle clicks on condition toggles (including icons inside them)
        element.addEventListener('click', async (ev) => {
            // Check if the click is on a condition toggle or its icon
            const toggleButton = ev.target.closest('.condition-toggle');
            if (!toggleButton) return;
            
            ev.preventDefault();
            ev.stopPropagation();
            ev.stopImmediatePropagation();
            
            const conditionId = toggleButton.dataset.condition;
            if (!conditionId) return;
            
            // Store current active tab before update
            const activeTabLink = this.element.querySelector('nav[data-group="sheet"] a.item.active');
            const activeTab = activeTabLink?.dataset.tab || 'main';
            const navGroup = this.element.querySelector('nav[data-group="sheet"]')?.dataset.group || 'sheet';
            this._preservedTab = { activeTab, navGroup };
            
            // Check current state before toggling - find ALL effects with this status
            const effectsWithStatus = this.actor.effects.filter(e => e.statuses.has(conditionId));
            const currentHasEffect = effectsWithStatus.length > 0;
            const newState = !currentHasEffect;
            
            // If there are duplicate effects, clean them up first
            if (effectsWithStatus.length > 1) {
                console.warn(`Found ${effectsWithStatus.length} duplicate effects for ${conditionId}, cleaning up...`);
                // Keep the first one, delete the rest
                for (let i = 1; i < effectsWithStatus.length; i++) {
                    try {
                        const effectId = effectsWithStatus[i].id;
                        // Check if the effect still exists in the collection before trying to delete it
                        const effectToDelete = this.actor.effects.get(effectId);
                        if (effectToDelete && !effectToDelete.isDeleted) {
                            await effectToDelete.delete();
                        }
                    } catch (err) {
                        // Silently ignore errors if effect was already deleted or doesn't exist
                        const errorMsg = err.message || String(err);
                        if (!errorMsg.includes('does not exist') && !errorMsg.includes('isDeleted')) {
                            console.warn(`Failed to delete duplicate effect:`, err);
                        }
                    }
                }
            }
            
            // Toggle the Active Effect on the Token
            // IMPORTANT: Update system.conditions with _manualToggle flag to prevent _onUpdate from creating duplicates
            try {
                // Only toggle if the state actually needs to change
                if (currentHasEffect !== newState) {
                    // Update system.conditions first with _preserveTab flag to prevent tab switching
                    await this.actor.update(
                        { [`system.conditions.${conditionId}`]: newState }, 
                        { _manualToggle: true, _preserveTab: true, render: false }
                    );
                    
                    // Then toggle the ActiveEffect - this should sync with the condition we just set
                    // Pass _preserveTab flag to prevent rendering
                    await this.actor.toggleStatusEffect(conditionId, { 
                        active: newState,
                        _preserveTab: true
                    });
                }
                
                // Manually update the active class immediately for better UX
                const hasEffect = this.actor.effects.some(e => e.statuses.has(conditionId));
                if (hasEffect) {
                    toggleButton.classList.add('active');
                } else {
                    toggleButton.classList.remove('active');
                }
                
                // Restore tab state immediately and with delays to ensure it sticks
                this._restoreTabState(activeTab, navGroup);
                requestAnimationFrame(() => this._restoreTabState(activeTab, navGroup));
                setTimeout(() => this._restoreTabState(activeTab, navGroup), 50);
                setTimeout(() => this._restoreTabState(activeTab, navGroup), 200);
            } catch (error) {
                console.warn(`Failed to toggle condition ${conditionId}:`, error);
                // Revert the UI state if toggle failed
                if (currentHasEffect) {
                    toggleButton.classList.add('active');
                } else {
                    toggleButton.classList.remove('active');
                }
                // Restore tab state even on error
                this._restoreTabState(activeTab, navGroup);
            }
        }, true); // Use capture phase

        // --- WOUND CHECKBOXES ---
        // V13: Use DOM methods instead of jQuery
        // Use event delegation to handle clicks on wound checkboxes
        element.addEventListener('change', async (ev) => {
            // Check if the change is on a wound checkbox
            const checkbox = ev.target;
            if (!checkbox || !checkbox.classList.contains('wound-checkbox')) return;
            
            ev.preventDefault();
            ev.stopPropagation();
            ev.stopImmediatePropagation();
            
            const isChecked = checkbox.checked;
            const field = checkbox.name;
            
            if (!field) return;

            // Store current active tab IMMEDIATELY before any updates
            const activeTabLink = this.element.querySelector('nav[data-group="sheet"] a.item.active');
            const activeTab = activeTabLink?.dataset.tab || 'main';
            const navGroup = this.element.querySelector('nav[data-group="sheet"]')?.dataset.group || 'sheet';

            // Store tab state in a way that persists across renders
            this._preservedTab = { activeTab, navGroup };
            
            // Update the actor - Foundry VTT handles dot notation automatically
            await this.actor.update({ [field]: isChecked }, { 
                render: true,
                _preserveTab: true
            });
            
            // Immediately restore tab state after update
            this._restoreTabState(activeTab, navGroup);
            
            // Use multiple strategies to preserve tab state
            requestAnimationFrame(() => {
                this._restoreTabState(activeTab, navGroup);
            });
            
            setTimeout(() => {
                this._restoreTabState(activeTab, navGroup);
            }, 50);
            
            setTimeout(() => {
                this._restoreTabState(activeTab, navGroup);
            }, 200);
        }, true); // Use capture phase to ensure we handle it first

    }

    /**
     * Override _onChangeInput to prevent form submission for wound checkboxes
     * This prevents ApplicationV2 from automatically processing the change
     * @override
     */
    _onChangeInput(ev) {
        // If this is a wound checkbox, prevent default form handling
        if (ev.target && ev.target.classList.contains('wound-checkbox')) {
            // Don't call super - we handle this manually in _onRender
            ev.preventDefault();
            ev.stopPropagation();
            ev.stopImmediatePropagation();
            return false;
        }
        
        // CRITICAL: Handle luck and HP value changes immediately to prevent reset
        const input = ev.target;
        
        // Handle luck value changes
        if (input && input.name === 'system.stats.luck.value') {
            const value = input.value;
            // Only update if the value is actually a number (not empty string)
            if (value !== '' && value !== null && value !== undefined) {
                const numValue = Number(value);
                if (!isNaN(numValue)) {
                    // Save immediately to prevent reset
                    const updateData = { "system.stats.luck.value": numValue };
                    this.actor.update(updateData, { render: false }).catch(err => {
                        console.error("Error updating luck value:", err);
                    });
                }
            }
            return false; // Prevent default form handling
        }
        
        // Handle HP value changes - save immediately to prevent reset
        if (input && input.name === 'system.hp.value') {
            const value = input.value;
            // Only update if the value is actually a number (not empty string)
            if (value !== '' && value !== null && value !== undefined) {
                const numValue = Number(value);
                if (!isNaN(numValue)) {
                    // Save immediately to prevent reset (will be clamped by _preUpdate)
                    const updateData = { "system.hp.value": numValue };
                    this.actor.update(updateData, { render: false }).catch(err => {
                        console.error("Error updating HP value:", err);
                    });
                }
            }
            return false; // Prevent default form handling
        }
        
        // For all other inputs, use the default behavior
        return super._onChangeInput(ev);
    }

    /**
     * Override _processFormData to exclude wound checkboxes from form processing
     * @override
     */
    _processFormData(formData) {
        // Remove wound checkbox fields from form data to prevent form submission
        const processedData = super._processFormData(formData);
        if (processedData) {
            // Filter out wound-related fields
            const woundFields = Object.keys(processedData).filter(key => 
                key.startsWith('system.wounds.')
            );
            woundFields.forEach(field => {
                delete processedData[field];
            });
            
            // CRITICAL: Ensure luck value is properly handled - don't let empty strings reset to 0
            if (processedData['system.stats.luck.value'] !== undefined) {
                const luckValue = processedData['system.stats.luck.value'];
                // If empty string, preserve current value instead of resetting
                if (luckValue === '' || luckValue === null) {
                    delete processedData['system.stats.luck.value'];
                } else {
                    // Ensure it's a valid number
                    const numValue = Number(luckValue);
                    if (isNaN(numValue)) {
                        // Invalid number - preserve current value
                        delete processedData['system.stats.luck.value'];
                    } else {
                        processedData['system.stats.luck.value'] = numValue;
                    }
                }
            }
            
            // CRITICAL: Ensure HP value is properly handled - don't let empty strings reset to 0 or max
            if (processedData['system.hp.value'] !== undefined) {
                const hpValue = processedData['system.hp.value'];
                // If empty string, preserve current value instead of resetting
                if (hpValue === '' || hpValue === null) {
                    delete processedData['system.hp.value'];
                } else {
                    // Ensure it's a valid number
                    const numValue = Number(hpValue);
                    if (isNaN(numValue)) {
                        // Invalid number - preserve current value
                        delete processedData['system.hp.value'];
                    } else {
                        // Valid number - let _preUpdate handle clamping to max
                        processedData['system.hp.value'] = numValue;
                    }
                }
            }
        }
        return processedData;
    }

    /**
     * Restore tab state helper method
     * @private
     */
    _restoreTabState(activeTab, navGroup) {
        const currentActiveTabLink = this.element.querySelector(`nav[data-group="${navGroup}"] a.item.active`);
        const currentActiveTab = currentActiveTabLink?.dataset.tab;
        
        if (currentActiveTab !== activeTab) {
            // Restore the active tab if it was reset
            this.element.querySelectorAll(`nav[data-group="${navGroup}"] a.item`).forEach(a => a.classList.remove('active'));
            this.element.querySelectorAll(`section[data-group="${navGroup}"].tab`).forEach(section => {
                section.classList.remove('active');
                section.style.display = 'none';
            });
            
            const tabLink = this.element.querySelector(`nav[data-group="${navGroup}"] a.item[data-tab="${activeTab}"]`);
            const tabContent = this.element.querySelector(`section[data-group="${navGroup}"].tab[data-tab="${activeTab}"]`);
            
            if (tabLink && tabContent) {
                tabLink.classList.add('active');
                tabContent.classList.add('active');
                tabContent.style.display = 'flex';
                tabContent.style.flexDirection = 'column';
                tabContent.style.overflowY = 'auto';
                tabContent.style.overflowX = 'hidden';
            }
        }
    }
    
    /**
     * Attach compendium link listeners
     * @private
     */
    _attachCompendiumListeners() {
        const element = this.element;
        if (!element) return;
        
        // --- COMPENDIUM LINKS ---
        // V13: Use DOM methods instead of jQuery
        const compendiumLinks = element.querySelectorAll('.open-compendium');
        console.log('Compendium links found:', compendiumLinks.length);
        
        compendiumLinks.forEach(link => {
            // Check if listener already attached
            if (link.dataset.listenerAttached === 'true') {
                console.log('Listener already attached to:', link);
                return;
            }
            
            console.log('Attaching listener to:', link, 'compendium:', link.dataset.compendium);
            link.dataset.listenerAttached = 'true';
            
            link.addEventListener('click', ev => {
                ev.preventDefault();
                ev.stopPropagation();
                ev.stopImmediatePropagation();
                
                const compendiumId = ev.currentTarget.dataset.compendium;
                console.log('Compendium link clicked:', compendiumId);
                
                if (!compendiumId) {
                    console.error('No compendium ID found on element:', ev.currentTarget);
                    ui.notifications.error('Compendium ID not found');
                    return;
                }
                
                const pack = game.packs.get(compendiumId);
                console.log('Found pack:', pack);
                
                if (pack) {
                    pack.render(true);
                    console.log('Compendium rendered:', compendiumId);
                } else {
                    console.warn('Compendium not found:', compendiumId, 'Available packs:', Array.from(game.packs.keys()));
                    ui.notifications.warn(`Compendium '${compendiumId}' not found.`);
                }
            });
        });
    }

    /**
     * Initialize tab switching for ApplicationV2
     * @private
     */
    _initializeTabs() {
        const element = this.element;
        const tabsConfig = this.constructor.TABS?.sheet;
        if (!tabsConfig) return;

        const group = tabsConfig.tabs[0]?.group || 'sheet';
        
        // Use preserved tab if available, otherwise use config default
        let initialTab = null;
        if (this._preservedTab && this._preservedTab.navGroup === group) {
            initialTab = this._preservedTab.activeTab;
        } else {
            initialTab = tabsConfig.initial || tabsConfig.tabs[0]?.id;
            // Update preserved tab state when initializing
            if (initialTab) {
                this._preservedTab = { activeTab: initialTab, navGroup: group };
            }
        }

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
        // Update preserved tab state when user manually switches tabs
        // This ensures _prepareContext uses the current tab on next render
        this._preservedTab = { activeTab: tabId, navGroup: group };
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

    // --- RELOAD LOGIC (Match by Linked Weapon Name) ---
    async _onReloadWeapon(event) {
        event.preventDefault();
        // V13: Use DOM methods instead of jQuery
        const li = event.currentTarget.closest(".item");
        if (!li) return;
        const weapon = this.actor.items.get(li.dataset.itemId);
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
                        // V13: html is a DOM element, not jQuery
                        const select = html.querySelector('#magazine-select');
                        const magId = select?.value;
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
        // Prevent double-firing: check if we're already processing this roll
        const targetElement = event.currentTarget;
        const targetRollType = (targetElement.dataset?.rollType || targetElement.getAttribute('data-roll-type')) || '';
        
        // For initiative rolls, use a debounce key based on actor ID and roll type
        if (targetRollType === 'init') {
            const debounceKey = `initiative_roll_${this.actor.id}`;
            const now = Date.now();
            const lastRollTime = this._lastRollTime || {};
            
            // If we rolled initiative for this actor in the last 500ms, skip this call
            if (lastRollTime[debounceKey] && (now - lastRollTime[debounceKey]) < 500) {
                console.log("_onRoll: Skipping duplicate initiative roll (debounced)");
                return;
            }
            
            // Record this roll time
            if (!this._lastRollTime) this._lastRollTime = {};
            this._lastRollTime[debounceKey] = now;
        }
        
        // CRITICAL: Check the actual clicked element first, before doing anything else
        const clickedElement = event.target;
        const currentTarget = event.currentTarget;
        
        console.log("_onRoll called", {
            target: clickedElement,
            targetClasses: clickedElement?.className,
            currentTarget: currentTarget,
            currentTargetClasses: currentTarget?.className,
            path: event.composedPath ? event.composedPath().map(el => ({
                tag: el.tagName,
                classes: el.className
            })) : []
        });
        
        // Check event path FIRST - most reliable way to detect delete buttons
        // BUT allow rollable elements even if they're in item-controls
        const path = event.composedPath ? event.composedPath() : [];
        const isRollableClick = currentTarget.classList.contains('rollable');
        const hasDeleteInPath = path.some(el => {
            if (!el || !el.classList) return false;
            // Don't block if this is a rollable element inside item-controls
            if (el.classList.contains('item-controls') && isRollableClick) {
                return false;
            }
            return el.classList.contains('chip-delete') || 
                   el.classList.contains('item-delete') ||
                   el.classList.contains('item-edit') ||
                   (el.tagName === 'A' && (el.classList.contains('item-delete') || el.classList.contains('item-edit'))) ||
                   (el.tagName === 'I' && (el.classList.contains('fa-trash') || el.classList.contains('fa-times')));
        });
        
        if (hasDeleteInPath) {
            console.log("_onRoll: Aborting - delete button in path");
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            return;
        }
        
        // Also check if click is in item-controls cell
        // BUT allow rollable elements (like attack icons) to work even if they're in item-controls
        const itemControls = clickedElement.closest('.item-controls');
        if (itemControls) {
            // Check if this is a rollable element (attack icon, etc.) - if so, allow it
            const isRollableInControls = clickedElement.closest('.rollable') || currentTarget.classList.contains('rollable');
            if (!isRollableInControls) {
                // It's in item-controls but not a rollable, so abort (e.g., delete/edit buttons)
                console.log("_onRoll: Aborting - click in item-controls (not rollable)");
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                return;
            }
        }
        
        // Check if the click originated from or is inside a delete/edit button
        // Check both the target and currentTarget, and also check the event path
        const isDeleteButton = clickedElement.closest('.chip-delete') || 
                               clickedElement.closest('.item-delete') || 
                               clickedElement.closest('.item-edit') ||
                               currentTarget.closest('.chip-delete') ||
                               currentTarget.closest('.item-delete') ||
                               currentTarget.closest('.item-edit') ||
                               clickedElement.classList.contains('chip-delete') ||
                               clickedElement.classList.contains('item-delete') ||
                               clickedElement.classList.contains('item-edit') ||
                               clickedElement.closest('a.chip-delete') ||
                               clickedElement.closest('a.item-delete') ||
                               clickedElement.closest('a.item-edit') ||
                               clickedElement.closest('i.fa-trash') ||
                               clickedElement.closest('i.fa-times');
        
        if (isDeleteButton) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            return;
        }
        
        event.preventDefault();
        event.stopPropagation();
        
        const element = event.currentTarget;
        // Safely access dataset - fallback to getting attribute directly if dataset is not available
        const dataset = element.dataset || {};
        const rollType = dataset.rollType || element.getAttribute('data-roll-type');
        
        console.log("_onRoll: Checking rollType", {
            element: element,
            elementClasses: element.className,
            dataset: dataset,
            rollType: rollType,
            directAttr: element.getAttribute('data-roll-type')
        });

        // INITIATIVE ROLL - Check this first as it's simple and doesn't need item context
        if (rollType === 'init') {
            console.log("_onRoll: Initiating initiative roll");
            try {
                // Get or create combat
                let combat = game.combat;
                if (!combat) {
                    // Create a new combat if none exists
                    const sceneId = game.scenes.active?.id;
                    if (!sceneId) {
                        ui.notifications.warn("No active scene. Please activate a scene first.");
                        return;
                    }
                    combat = await Combat.create({ scene: sceneId });
                    // Refresh combat tracker to show the new combat
                    if (ui.combat) {
                        ui.combat.render();
                    }
                }
                
                // Find existing combatant or create one
                let combatant = combat.combatants.find(c => c.actor?.id === this.actor.id);
                
                if (!combatant) {
                    // Try to find a token for this actor on the current scene
                    const scene = game.scenes.active;
                    if (!scene) {
                        ui.notifications.warn("No active scene. Please activate a scene first.");
                        return;
                    }
                    
                    const token = scene.tokens.find(t => t.actor?.id === this.actor.id);
                    if (token) {
                        // Create combatant with existing token
                        const created = await combat.createEmbeddedDocuments("Combatant", [{
                            tokenId: token.id,
                            actorId: this.actor.id,
                            hidden: false
                        }]);
                        combatant = combat.combatants.get(created[0].id);
                    } else {
                        // Create a temporary token for the actor
                        const tokenData = await this.actor.getTokenData();
                        const createdToken = await scene.createEmbeddedDocuments("Token", [{
                            ...tokenData,
                            actorId: this.actor.id,
                            x: 0,
                            y: 0
                        }]);
                        // Create combatant with the new token
                        const created = await combat.createEmbeddedDocuments("Combatant", [{
                            tokenId: createdToken[0].id,
                            actorId: this.actor.id,
                            hidden: false
                        }]);
                        combatant = combat.combatants.get(created[0].id);
                    }
                }
                
                // Roll initiative on the combatant using Combat.rollInitiative() which displays dice and chat
                if (combatant) {
                    // Use Combat.rollInitiative() which handles dice rolling and chat messages properly
                    await combat.rollInitiative([combatant.id]);
                    console.log("_onRoll: Initiative rolled successfully");
                } else {
                    throw new Error("Failed to create or find combatant");
                }
            } catch (error) {
                console.error("_onRoll: Initiative roll error:", error);
                ui.notifications.error(`Failed to roll initiative: ${error.message}`);
            }
            return;
        }
        
        console.log("_onRoll: rollType is not 'init', it is:", rollType);

        // Handle Item Rolls (triggered by your crosshairs icon)
        if (rollType === 'item') {
            // V13: Use DOM methods instead of jQuery
            const itemElement = element.closest('.item');
            const itemId = itemElement?.dataset?.itemId || itemElement?.getAttribute('data-item-id');
            const item = this.actor.items.get(itemId);
            if (item?.type === 'weapon') {
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
                return;
            }
            else if (item?.type === 'explosive') {
                await this._renderExplosiveDialog(item);
                return;
            }
            else if (item?.type === 'ebbFormula') {
                this._executeEbbRoll(item);
                return;
            } else if (item) {
                item.sheet.render();
                return;
            }
            return;
        }

        let globalMod = 0;
        if (this.actor.system.conditions?.prone) globalMod -= 1;
        if (this.actor.system.conditions?.stunned) globalMod -= 1;

        // STAT ROLL
        if (rollType === 'stat') {
            const statKey = (dataset.key || element.getAttribute('data-key'))?.toLowerCase();
            if (!statKey) return;
            
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
            return;
        }

        // SKILL ROLL
        if (rollType === 'skill') {
            this._executeSkillRoll(element);
            return;
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

        // V2: Use ApplicationV2 instead of V1 Dialog
        const dialog = new AttackDialog({
            title: `Attack: ${item.name} ${rangePenaltyMsg}`,
            item: item,
            isMelee: isMelee,
            templateData: templateData,
            onRoll: (element) => this._processWeaponRoll(item, element, isMelee)
        });
        
        dialog.render(true);
    }

    async _executeSkillRoll(element) {
        // 1. GET ITEM & DATA
        // V13: Use DOM methods instead of jQuery
        const itemElement = element.closest('.item');
        const itemId = itemElement?.dataset.itemId;
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

    async _processWeaponRoll(item, element, isMelee) {
        // V2: element is already a DOM element, not a jQuery object
        const form = element.querySelector("form") || element; // element might be the form itself
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

        // V2: Use ApplicationV2 instead of V1 Dialog
        const dialog = new AttackDialog({
            title: `Throw: ${item.name}`,
            item: item,
            isMelee: false,
            templateData: templateData,
            onRoll: (element) => this._processExplosiveRoll(item, element)
        });
        
        dialog.render(true);
    }

    async _processExplosiveRoll(item, element) {
        // V2: element is already a DOM element, not a jQuery object
        const form = element.querySelector("form") || element; // element might be the form itself
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