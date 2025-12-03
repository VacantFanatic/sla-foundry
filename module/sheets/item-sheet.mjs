/**
 * Extend the basic ItemSheet with some very simple modifications
 * @extends {ItemSheet}
 */
export class SlaItemSheet extends ItemSheet {

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["sla-industries", "sheet", "item"],
      width: 520,
      height: 480,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "attributes" }],
      // CRITICAL: This enables the _onDrop handler for the specific CSS class
      dragDrop: [{ dragSelector: null, dropSelector: ".drop-zone" }] 
    });
  }

  /** @override */
  get template() {
    const path = "systems/sla-industries/templates/item";
    return `${path}/item-sheet.hbs`;
  }

  /* -------------------------------------------- */
  /* Data Preparation                            */
  /* -------------------------------------------- */

  /** @override */
  async getData() {
    const context = await super.getData();
    const item = this.item;

    context.system = item.system;
    context.flags = item.flags;
    context.item = item;

    // Enrich Description (Bio/Rules)
    context.enrichedDescription = await TextEditor.enrichHTML(item.system.description, {
        async: true,
        relativeTo: this.actor
    });

    context.rollData = {};
    if (this.object?.parent) {
      context.rollData = this.object.parent.getRollData();
    }

    // Dropdown Configs
    context.config = {
        stats: { "str":"STR", "dex":"DEX", "know":"KNOW", "conc":"CONC", "cha":"CHA", "cool":"COOL" },
        combatSkills: CONFIG.SLA?.combatSkills || {},
        disciplineSkills: CONFIG.SLA?.ebbDisciplines || {}
    };

    return context;
  }

  /* -------------------------------------------- */
  /* Event Listeners                             */
  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;

    // DELETE GRANTED SKILL (Species/Package)
    html.find('.delete-grant').click(async ev => {
        ev.preventDefault();
        const index = parseInt(ev.currentTarget.dataset.index);
        
        // Safely get array
        let currentSkills = this.item.system.skills;
        if (!Array.isArray(currentSkills)) currentSkills = [];
        else currentSkills = foundry.utils.deepClone(currentSkills);
        
        // Remove item at index
        currentSkills.splice(index, 1);
        
        // Save
        await this.item.update({ "system.skills": currentSkills });
    });
  }

  /* -------------------------------------------- */
  /* Drag and Drop Logic                         */
  /* -------------------------------------------- */

  /** * Handle dropping a Skill onto a Species or Package Item Sheet
   * @override
   */
  async _onDrop(event) {
      // 1. Check if this item type allows dropping (Species/Package)
      const allowedTypes = ["species", "package"];
      if (!allowedTypes.includes(this.item.type)) return;

      // 2. Get the dropped data
      const data = TextEditor.getDragEventData(event);
      const droppedItem = await Item.implementation.fromDropData(data);

      if (!droppedItem) return;

      // 3. Validate Item Type (Only Skills/Traits/Disciplines/Formulas allowed)
      if (droppedItem.type !== "skill" && droppedItem.type !== "discipline" && droppedItem.type !== "trait" && droppedItem.type !== "ebbFormula") {
          return ui.notifications.warn("You can only add Skills, Traits, Disciplines, or Formulas to this list.");
      }

      // 4. Get Current List (Safe Array)
      let currentSkills = this.item.system.skills;
      if (!Array.isArray(currentSkills)) {
          currentSkills = [];
      } else {
          currentSkills = foundry.utils.deepClone(currentSkills);
      }

      // 5. Check for Duplicates
      if (currentSkills.find(s => s.name === droppedItem.name)) {
          return ui.notifications.warn(`${droppedItem.name} is already in the list.`);
      }

      // 6. Prepare Data to Save (Clone and Strip ID)
      const skillData = droppedItem.toObject();
      delete skillData._id; // We want a raw data object, not a reference to an ID
      
      // Default Rank to 1 if 0 (so it actually does something when granted)
      if (!skillData.system.rank) skillData.system.rank = 1;

      // 7. Push and Update
      currentSkills.push(skillData);
      await this.item.update({ "system.skills": currentSkills });
      
      // Visual Feedback
      console.log(`SLA | Added ${droppedItem.name} to ${this.item.name}`);
  }
}