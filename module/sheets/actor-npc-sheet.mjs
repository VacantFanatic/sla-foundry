import { SlaActorSheet } from "./actor-sheet.mjs";

/**
 * Extend the basic SlaActorSheet with NPC-specific modifications
 * @extends {SlaActorSheet}
 */
export class SlaNPCSheet extends SlaActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["sla-industries", "sheet", "actor", "npc", "threat-sheet"], // Added threat-sheet class
      template: "systems/sla-industries/templates/actor/actor-npc-sheet.hbs",
      width: 600,
      height: 600,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "stats" }]
    });
  }
}
