/**
 * Extend the basic ItemSheet
 * @extends {ItemSheet}
 */
export class SlaItemSheet extends ItemSheet {

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["sla-industries", "sheet", "item"],
      template: "systems/sla-industries/templates/item/item-sheet.hbs",
      width: 520,
      height: 480,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "attributes", group: "primary" }]
    });
  }

// module/sheets/item-sheet.mjs

	async getData() {
		const context = super.getData();
		const itemData = context.item;
		context.system = itemData.system;
		context.flags = itemData.flags;

		context.config = CONFIG.SLA; 

		// --- DEBUGGING BLOCK ---
		console.log("🔻 DEBUG: SlaItemSheet Data 🔻");
		console.log("Item Type:", this.item.type);
		console.log("CONTEXT CONFIG:", context.config); 
  
		// If config exists, let's check for the specific list you need (e.g., stats)
		if (context.config) {
			console.log("STATS LIST:", context.config.stats);
		} else {
			console.warn("⚠️ CONFIG.SLA is undefined! Check main.mjs");
		}
		console.log("🔺 -------------------------- 🔺");
		// --------------------------------
  
		return context;
	}

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;

    // Handle dropping a weapon onto the Magazine "Weapon Link" zone
    const dropZone = html.find('.weapon-link');
    if (dropZone.length > 0) {
        dropZone[0].addEventListener('drop', this._onDropWeapon.bind(this));
        dropZone[0].addEventListener('dragover', (ev) => ev.preventDefault()); // Allow drop
    }

    // Unlink weapon
    html.find('.remove-link').click(async ev => {
        ev.preventDefault();
        await this.item.update({ "system.linkedWeapon": "" });
    });
  }

  /**
   * Handle dropping a weapon item to link it to this magazine
   */
  async _onDropWeapon(event) {
      event.preventDefault();
      try {
          const data = JSON.parse(event.dataTransfer.getData('text/plain'));
          if (data.type !== "Item") return;

          const item = await Item.implementation.fromDropData(data);
          if (item && item.type === "weapon") {
              await this.item.update({ "system.linkedWeapon": item.name });
              ui.notifications.info(`Linked Magazine to: ${item.name}`);
          } else {
              ui.notifications.warn("Only Weapons can be linked to a Magazine.");
          }
      } catch (err) {
          console.error("SLA | Weapon Drop Failed:", err);
      }
  }
}