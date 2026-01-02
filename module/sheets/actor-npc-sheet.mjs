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
      
      console.log("SLA Industries | NPC Wound checkbox changed:", {
        field: field,
        systemPath: systemPath,
        checkboxChecked: isChecked,
        actorDataValue: currentValue,
        willChange: currentValue !== isChecked,
        actorType: this.actor.type,
        actorName: this.actor.name
      });

      // Only update if the values don't match (avoid unnecessary updates)
      if (currentValue === isChecked) {
        console.log("SLA Industries | NPC Values already match, skipping update");
        return;
      }

      // Update the actor
      const updateData = { [field]: isChecked };
      console.log("SLA Industries | NPC Calling actor.update with:", updateData);
      
      try {
        await this.actor.update(updateData);
        console.log("SLA Industries | NPC actor.update completed");
        
        // Handle wound effects
        if (field.startsWith("system.wounds.")) {
          // Wait for Foundry to sync the data model
          await new Promise(resolve => setTimeout(resolve, 100));
          
          console.log("SLA Industries | NPC Wound field updated, calling _handleWoundEffects");
          
          if (this.actor._handleWoundEffects) {
            // Pass the update data so _handleWoundEffects can use it
            const woundUpdateData = { [field]: isChecked };
            console.log("SLA Industries | NPC Passing woundUpdateData to _handleWoundEffects:", woundUpdateData);
            await this.actor._handleWoundEffects(woundUpdateData);
            
            // Force a re-render to update the condition icons
            await this.render(false);
          } else {
            console.warn("SLA Industries | NPC _handleWoundEffects method not found on actor");
          }
        }
      } catch (error) {
        console.error("SLA Industries | NPC Error updating actor:", error);
        // Revert checkbox on error
        target.checked = !isChecked;
      }
    });
  }
}
