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

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;

    // NPC-specific wound checkbox handling
    // This overrides the base class handler to ensure it works correctly for NPCs
    html.find('.wound-checkbox').off('change').change(async ev => {
      const target = ev.currentTarget;
      const field = target.name;
      const isChecked = target.checked;
      
      // Get current value from actor data for comparison
      const systemPath = field.replace("system.", "");
      const currentValue = foundry.utils.getProperty(this.actor.system, systemPath);

      // Only update if the values don't match (avoid unnecessary updates)
      if (currentValue === isChecked) {
        return;
      }

      // Update the actor
      const updateData = { [field]: isChecked };
      
      try {
        // Update the actor. The _onUpdate method in Actor.mjs will handle
        // the side effects (Bleeding, Stunned, Immobile) automatically.
        await this.actor.update(updateData);
      } catch (error) {
        console.error("SLA Industries | NPC Error updating actor:", error);
        // Revert checkbox on error
        target.checked = !isChecked;
      }
    });
  }
}
