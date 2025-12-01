/**
 * Extend the basic Item with some very simple modifications.
 * @extends {Item}
 */
export class BoilerplateItem extends Item {

  prepareDerivedData() {
    super.prepareDerivedData();
  }

  getRollData() {
    if ( !this.actor ) return null;
    const rollData = this.actor.getRollData();
    rollData.item = foundry.utils.deepClone(this.system);
    return rollData;
  }

  /**
   * Toggle the Active state of a drug/item and create/delete Active Effects.
   */
  async toggleActive() {
      // 1. Toggle Boolean
      const newState = !this.system.active;
      await this.update({ "system.active": newState });

      // 2. Handle Active Effect
      if (!this.actor) return;

      if (newState) {
          // ENABLED: Create Effect
          const effectData = {
              name: this.name, // <--- FIXED: Changed 'label' to 'name' for V11+ compatibility
              icon: this.img,
              origin: this.uuid,
              disabled: false,
              duration: { seconds: this._getDurationSeconds(this.system.duration) },
              changes: []
          };

          // Map Mods to Changes
          if (this.type === 'drug') {
              // Mod 1
              const m1 = this.system.mods.first;
              if (m1.value !== 0) {
                  effectData.changes.push({
                      key: `system.stats.${m1.stat}.value`,
                      mode: 2, // ADD
                      value: m1.value
                  });
              }
              // Mod 2
              const m2 = this.system.mods.second;
              if (m2.value !== 0) {
                  effectData.changes.push({
                      key: `system.stats.${m2.stat}.value`,
                      mode: 2, // ADD
                      value: m2.value
                  });
              }
              // Damage Reduction
              if (this.system.damageReduction !== 0) {
                   effectData.changes.push({
                      key: `system.wounds.damageReduction`,
                      mode: 2, // ADD
                      value: this.system.damageReduction
                  });                 
              }
          }

          if (effectData.changes.length > 0) {
              await this.actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
              ui.notifications.info(`${this.name} applied.`);
          }

      } else {
          // DISABLED: Find and Delete Effect
          const effect = this.actor.effects.find(e => e.origin === this.uuid);
          if (effect) {
              await effect.delete();
              ui.notifications.info(`${this.name} removed.`);
          }
      }
  }

  // Helper to guess seconds from string
  _getDurationSeconds(str) {
      if (!str) return null;
      const s = str.toLowerCase();
      if (s.includes("hour")) return parseInt(s) * 3600;
      if (s.includes("min")) return parseInt(s) * 60;
      return null;
  }
  
  /**
   * @override
   * Triggered before an Item is updated in the database.
   */
  async _preUpdate(changed, options, user) {
    await super._preUpdate(changed, options, user);

    // Check if we are updating the system data of a Skill or Discipline
    if ((this.type === 'skill' || this.type === 'discipline') && changed.system) {
        
        // Check if Rank is being modified
        if (changed.system.rank !== undefined) {
            const newRank = changed.system.rank;
            const maxRank = 4; // HARD CAP

            // If the new rank exceeds the limit
            if (newRank > maxRank) {
                // Force it back to the limit
                changed.system.rank = maxRank;
                
                // Notify the user
                if (typeof ui !== "undefined") {
                    ui.notifications.warn(`${this.name} Rank capped at ${maxRank}.`);
                }
            }
        }
    }
  }
}