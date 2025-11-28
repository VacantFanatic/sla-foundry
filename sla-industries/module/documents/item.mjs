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
   */
  async _preUpdate(changed, options, user) {
    await super._preUpdate(changed, options, user);

    // --- LOGIC REMOVED ---
    // We previously enforced a limit (Rank <= Stat).
    // This has been removed to allow for XP Advancement rules 
    // where skills can exceed attributes.
  }
}