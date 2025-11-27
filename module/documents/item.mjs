/**
 * Extend the basic Item with some very simple modifications.
 * @extends {Item}
 */
export class BoilerplateItem extends Item {
  /**
   * Augment the basic Item data model with additional dynamic data.
   */
  prepareDerivedData() {
    const itemData = this;
    const system = itemData.system;
    const flags = itemData.flags.boilerplate || {};

    // Make sure you call super.prepareDerivedData() first!
    super.prepareDerivedData();

    // Derived Data typically goes here
  }

  /**
   * Prepare a data object which is passed to any Roll formulas which are created related to this Item
   * @private
   */
  getRollData() {
    // If present, return the actor's roll data.
    if ( !this.actor ) return null;
    const rollData = this.actor.getRollData();
    
    // Grab the item's system data as well.
    rollData.item = foundry.utils.deepClone(this.system);

    return rollData;
  }

  /**
   * @override
   * Triggered before an Item is updated in the database.
   * We use this to enforce the Rank limits (Max 4, Max <= Stat).
   */
  async _preUpdate(changed, options, user) {
    await super._preUpdate(changed, options, user);

    // Only apply logic if we are updating a SKILL's system data
    if (this.type === 'skill' && changed.system) {
        
        // Check if Rank is being changed
        if (changed.system.rank !== undefined) {
            
            // 1. HARD CAP: Max 4
            let maxRank = 4;
            let currentRank = changed.system.rank;

            // 2. DYNAMIC CAP: Cannot exceed Associated Stat
            // We can only check this if the item belongs to an Actor
            if (this.actor) {
                // Determine which stat to check (default to dex if not set)
                const statKey = this.system.stat || "dex"; 
                
                // Retrieve the actor's stat value safely
                const actorStat = this.actor.system.stats[statKey]?.value || 0;
                
                // The Limit is the LOWER of (4) or (Actor Stat)
                maxRank = Math.min(4, actorStat);
            }

            // 3. Apply the Limit
            if (currentRank > maxRank) {
                changed.system.rank = maxRank;
                
                // Notify the user why it snapped back
                if (this.actor) {
                    ui.notifications.warn(`Skill Rank capped at ${maxRank} (Limited by Stat or Max 4).`);
                }
            }
        }
    }
  }
}