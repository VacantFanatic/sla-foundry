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
    const context = await super.getData(); // Ensure we await super
    const itemData = context.item;
    context.system = itemData.system;
    context.flags = itemData.flags;
    context.config = CONFIG.SLA; 

    // --- NEW: EBB IMAGE LOOKUP ---
    // This finds the icon for the partial to display
    if (this.item.actor && context.system.discipline) {
        // Find an item on the actor with the SAME NAME and type 'discipline'
        const disciplineItem = this.item.actor.items.find(i => 
            i.type === "discipline" && 
            i.name.toLowerCase() === context.system.discipline.toLowerCase()
        );
        context.linkedDisciplineImg = disciplineItem ? disciplineItem.img : "icons/svg/item-bag.svg";
    } else {
        context.linkedDisciplineImg = "icons/svg/item-bag.svg";
    }

    return context;
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;

    // --- 1. MAGAZINE LINKING (Existing) ---
    const weaponDropZone = html.find('.weapon-link');
    if (weaponDropZone.length > 0) {
        weaponDropZone[0].addEventListener('drop', this._onDropWeapon.bind(this));
        weaponDropZone[0].addEventListener('dragover', (ev) => ev.preventDefault());
    }

    html.find('.remove-link').click(async ev => {
        ev.preventDefault();
        await this.item.update({ "system.linkedWeapon": "" });
    });

    // --- 2. EBB DISCIPLINE LINKING (NEW) ---
    
    // A. Delete Handler
    // We use .on() attached to the container to ensure it catches clicks even if re-rendered
    html.find('.discipline-drop-zone').on('click', '.remove-discipline', async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        await this.item.update({ "system.discipline": "" });
    });

    // B. Drop Handler
    const disciplineDropZone = html.find('.discipline-drop-zone');
    if (disciplineDropZone.length > 0) {
        disciplineDropZone[0].addEventListener('drop', this._onDropDiscipline.bind(this));
        // Add dragover to ensure the browser allows the drop
        disciplineDropZone[0].addEventListener('dragover', (ev) => {
             ev.preventDefault(); 
             ev.dataTransfer.dropEffect = 'copy';
        });
    }
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

  /**
   * --- NEW: Handle dropping a Discipline item ---
   */
  async _onDropDiscipline(event) {
    event.preventDefault();
    event.stopPropagation();

    try {
        const data = JSON.parse(event.dataTransfer.getData('text/plain'));
        if (data.type !== "Item") return;

        const item = await Item.implementation.fromDropData(data);
        
        // Validation: Must be a Discipline
        if (!item || item.type !== "discipline") {
            return ui.notifications.warn("Only 'Discipline' items can be linked here.");
        }

        // Update the Formula with the name of the dropped discipline
        await this.item.update({
            "system.discipline": item.name
        });
        
    } catch (err) {
        console.error("SLA | Discipline Drop Failed:", err);
    }
  }
}