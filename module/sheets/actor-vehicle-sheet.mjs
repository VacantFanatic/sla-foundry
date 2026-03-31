import { SlaActorSheet } from "./actor-sheet.mjs";

export class SlaVehicleSheet extends SlaActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["sla-industries", "sheet", "actor", "vehicle-sheet"],
      template: "systems/sla-industries/templates/actor/actor-vehicle-sheet.hbs",
      width: 620,
      height: 700
    });
  }
}
