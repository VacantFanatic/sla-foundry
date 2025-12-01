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
      dragDrop: [{ dragSelector: null, dropSelector: ".drop-zone" }]
    });
  }

  /** @override */
  get template() {
    const path = "systems/sla-industries/templates/item";
    return `${path}/item-sheet.hbs`;
  }

  /** @override */
  async getData() {
    const context = await super.getData();
    const item = this.item;

    context.system = item.system;
    context.flags = item.flags;
    context.item = item;

    context.rollData = {};
    if (this.object?.parent) {
      context.rollData = this.object.parent.getRollData();
    }

    context.config = {
        stats: { "str":"STR", "dex":"DEX", "know":"KNOW", "conc":"CONC", "cha":"CHA", "cool":"COOL" },
        combatSkills: CONFIG.SLA?.combatSkills || {},
        disciplineSkills: CONFIG.SLA?.ebbDisciplines || {}
    };

    return context;
  }

   /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;

    // ----------------------------------------------------
    // DELETE GRANTED SKILL (Species/Package)
    // ----------------------------------------------------
    html.find('.delete-grant').click(async ev => {
        ev.preventDefault();
        
        // 1. Get the index from the HTML
        const index = parseInt(ev.currentTarget.dataset.index);
        
        // 2. Clone the current array (Safety first!)
        const currentSkills = this.item.system.skills ? foundry.utils.deepClone(this.item.system.skills) : [];
        
        // 3. Remove the item
        if (index > -1 && index < currentSkills.length) {
            currentSkills.splice(index, 1);
            
            // 4. Save to database
            await this.item.update({ "system.skills": currentSkills });
        }
    });
  }

  /** * Handle dropping a Skill onto a Species or Package 
   * @override
   */
  async _onDrop(event) {
      const data = TextEditor.getDragEventData(event);
      const allowedTypes = ["species", "package"];
      
      if (!allowedTypes.includes(this.item.type)) return;

      const droppedItem = await Item.implementation.fromDropData(data);
      
      if (!droppedItem) return;
      if (droppedItem.type !== "skill" && droppedItem.type !== "discipline" && droppedItem.type !== "trait" && droppedItem.type !== "ebbFormula") {
          return ui.notifications.warn("You can only add Skills, Traits, Disciplines, or Formulas to this list.");
      }

      // CRASH FIX: Ensure currentSkills is an array
      // Old items might have "" (string), which crashes .find()
      let currentSkills = this.item.system.skills;
      if (!Array.isArray(currentSkills)) {
          currentSkills = [];
      } else {
          currentSkills = duplicate(currentSkills);
      }

      // Check for duplicates
      if (currentSkills.find(s => s.name === droppedItem.name)) {
          return ui.notifications.warn(`${droppedItem.name} is already in the list.`);
      }

      const skillData = droppedItem.toObject();
      delete skillData._id;
      
      currentSkills.push(skillData);

      await this.item.update({ "system.skills": currentSkills });
  }
}