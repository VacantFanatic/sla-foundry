import { SlaActorSheet } from "./actor-sheet.mjs";

/**
 * Vehicle sheet (Application V2).
 * @extends {SlaActorSheet}
 */
export class SlaVehicleSheet extends SlaActorSheet {

    /** @override */
    static PARTS = {
        sheet: {
            template: "systems/sla-industries/templates/actor/actor-vehicle-sheet-v2.hbs",
            scrollable: [""]
        }
    };

    /** @override */
    static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
        classes: ["sla-industries", "sheet", "actor", "vehicle-sheet"],
        position: {
            width: 620,
            height: 700
        }
    }, { inplace: false });
}
