import { SlaActorSheet } from "./actor-sheet.mjs";

/**
 * Extend the basic SlaActorSheet with NPC-specific modifications
 * @extends {SlaActorSheet}
 */
export class SlaNPCSheet extends SlaActorSheet {
  /** @override */
  static get defaultOptions() {
    const parentOptions = super.defaultOptions || {};
    // Merge classes arrays properly - combine parent classes with our own
    const parentClasses = Array.isArray(parentOptions.classes) ? parentOptions.classes : [];
    const mergedClasses = [...new Set([...parentClasses, "sla-industries", "sheet", "actor", "npc", "threat-sheet"])];
    
    return foundry.utils.mergeObject(parentOptions, {
      classes: mergedClasses,
      template: "systems/sla-industries/templates/actor/actor-npc-sheet.hbs",
      position: {
        width: 600,
        height: 600
      }
      // Note: NPC sheet doesn't use tabs - it's a single view sheet
    });
  }
}
