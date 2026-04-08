import { SlaActorSheet } from "./actor-sheet.mjs";

/**
 * NPC / threat sheet (Application V2).
 * @extends {SlaActorSheet}
 */
export class SlaNPCSheet extends SlaActorSheet {

    /** @override */
    static TABS = {
        primary: {
            tabs: [
                { id: "combat", label: "Combat", icon: "fa-crosshairs" },
                { id: "inventory", label: "Inventory", icon: "fa-box-open" },
                { id: "effects", label: "Effects", icon: "fa-bolt" },
                { id: "skills", label: "Skills", icon: "fa-graduation-cap" },
                { id: "notes", label: "Notes", icon: "fa-book-open" }
            ],
            initial: "combat"
        }
    };

    /** @override */
    static PARTS = {
        sheet: {
            template: "systems/sla-industries/templates/actor/actor-npc-sheet-v2.hbs",
            scrollable: [""]
        }
    };

    /** @override */
    static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
        classes: ["sla-industries", "sheet", "actor", "npc", "threat-sheet"],
        position: {
            width: 600,
            height: 600
        }
    }, { inplace: false });

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        context.enableNPCWoundTracking = game.settings.get("sla-industries", "enableNPCWoundTracking");
        return context;
    }
}
