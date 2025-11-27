/**
 * Extend the basic ItemSheet
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
    let actor = this.object?.parent ?? null;
    if (actor) context.rollData = actor.getRollData();

    // ----------------------------------------------------
    // CONFIG: Use Global CONFIG.SLA (No Import Needed)
    // ----------------------------------------------------
    context.config = {
        stats: {
            "str": "STR", "dex": "DEX", "know": "KNOW",
            "conc": "CONC", "cha": "CHA", "cool": "COOL"
        },
        combatSkills: CONFIG.SLA?.combatSkills || {}
    };

    return context;
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;
  }
}