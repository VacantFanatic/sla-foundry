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

    context.rollData = {};
    if (this.object?.parent) {
      context.rollData = this.object.parent.getRollData();
    }

    // Pass Stats and Skills from GLOBAL CONFIG
    context.config = {
        stats: { "str":"STR", "dex":"DEX", "know":"KNOW", "conc":"CONC", "cha":"CHA", "cool":"COOL" },
        combatSkills: CONFIG.SLA?.combatSkills || {}
    };

    return context;
  }

/** @override */
  activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;

    // REPAIR ARMOR BUTTON
    html.find('.repair-armor').click(async ev => {
        ev.preventDefault();
        const max = this.item.system.resistance.max;
        await this.item.update({ "system.resistance.value": max });
        ui.notifications.info("Armor repaired to full resistance.");
    });
  }
}