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
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "attributes" }]
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

    // --- MISSING FIX: ENRICH DESCRIPTION ---
    // This converts the raw text into the visual editor format
    context.enrichedDescription = await TextEditor.enrichHTML(item.system.description, {
        async: true,
        relativeTo: this.actor
    });

    context.rollData = {};
    if (this.object?.parent) {
      context.rollData = this.object.parent.getRollData();
    }

    // CONFIG
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
    
    // Listeners for custom item logic (like delete-grant) go here if added back
    html.find('.delete-grant').click(async ev => {
        const index = ev.currentTarget.dataset.index;
        let currentSkills = this.item.system.skills;
        if (!Array.isArray(currentSkills)) currentSkills = [];
        else currentSkills = duplicate(currentSkills);
        
        currentSkills.splice(index, 1);
        await this.item.update({ "system.skills": currentSkills });
    });
  }

  /** @override */
  async _onDrop(event) {
      const data = TextEditor.getDragEventData(event);
      const allowedTypes = ["species", "package"];
      
      if (!allowedTypes.includes(this.item.type)) return;

      const droppedItem = await Item.implementation.fromDropData(data);
      
      if (!droppedItem) return;
      if (droppedItem.type !== "skill" && droppedItem.type !== "discipline" && droppedItem.type !== "trait" && droppedItem.type !== "ebbFormula") {
          return ui.notifications.warn("You can only add Skills, Traits, Disciplines, or Formulas to this list.");
      }

      let currentSkills = this.item.system.skills;
      if (!Array.isArray(currentSkills)) {
          currentSkills = [];
      } else {
          currentSkills = duplicate(currentSkills);
      }

      if (currentSkills.find(s => s.name === droppedItem.name)) {
          return ui.notifications.warn(`${droppedItem.name} is already in the list.`);
      }

      const skillData = droppedItem.toObject();
      delete skillData._id;
      
      currentSkills.push(skillData);

      await this.item.update({ "system.skills": currentSkills });
  }
}