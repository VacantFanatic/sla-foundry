import { SlaActorSheet } from "./actor-sheet.mjs";

/**
 * Extend the basic SlaActorSheet with NPC-specific modifications
 * @extends {SlaActorSheet}
 */
export class SlaNPCSheet extends SlaActorSheet {
  static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
    classes: ["sla-industries", "sheet", "actor", "npc", "threat-sheet"], // Added threat-sheet class
    template: "systems/sla-industries/templates/actor/actor-npc-sheet.hbs",
    position: {
      width: 600,
      height: 600
    }
    // Note: NPC sheet doesn't use tabs - it's a single view sheet
  });
}
