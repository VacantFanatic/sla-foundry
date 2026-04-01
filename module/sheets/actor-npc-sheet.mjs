import { SlaActorSheet } from "./actor-sheet.mjs";

/**
 * NPC / threat sheet (Application V2).
 * @extends {SlaActorSheet}
 */
export class SlaNPCSheet extends SlaActorSheet {

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
