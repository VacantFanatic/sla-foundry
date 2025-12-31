/**
 * Define a set of template paths to pre-load
 */
export const preloadHandlebarsTemplates = async function () {

  // Define template paths as an array of strings
  const templatePaths = [
    "systems/sla-industries/templates/actor/parts/header.hbs",
    "systems/sla-industries/templates/actor/parts/stats.hbs",
    "systems/sla-industries/templates/actor/parts/skills.hbs",
    "systems/sla-industries/templates/actor/parts/traits.hbs",
    "systems/sla-industries/templates/actor/parts/secondary.hbs",
    "systems/sla-industries/templates/actor/parts/wounds.hbs",
    "systems/sla-industries/templates/actor/parts/inventory.hbs",
    "systems/sla-industries/templates/actor/parts/ebb.hbs",
    "systems/sla-industries/templates/actor/parts/disciplines.hbs",
    "systems/sla-industries/templates/chat/chat-weapon-rolls.hbs",
    "systems/sla-industries/templates/chat/chat-damage.hbs",
    "systems/sla-industries/templates/actor/parts/ebb-drop-zone.hbs",
    "systems/sla-industries/templates/actor/parts/header-card.hbs",
    "systems/sla-industries/templates/actor/parts/main-tab.hbs",
    "systems/sla-industries/templates/actor/parts/inventory-tab.hbs",
    "systems/sla-industries/templates/actor/parts/bio-traits-tab.hbs",
    "systems/sla-industries/templates/item/parts/item-catalogue.hbs",
    "systems/sla-industries/templates/item/parts/item-weapon.hbs",
    "systems/sla-industries/templates/item/parts/item-armor.hbs",
    "systems/sla-industries/templates/item/parts/item-magazine.hbs",
    "systems/sla-industries/templates/item/parts/item-drug.hbs",
    "systems/sla-industries/templates/item/parts/item-academic.hbs",
    "systems/sla-industries/templates/item/parts/item-spectral.hbs",
    "systems/sla-industries/templates/item/parts/item-dossier.hbs",
    "systems/sla-industries/templates/item/parts/item-physical-weapon.hbs",
    "systems/sla-industries/templates/item/parts/item-physical-armor.hbs",
    "systems/sla-industries/templates/item/parts/item-physical-magazine.hbs",
    "systems/sla-industries/templates/item/parts/item-physical-explosive.hbs",
    "systems/sla-industries/templates/item/parts/item-physical-drug.hbs",
    "systems/sla-industries/templates/item/parts/item-physical-item.hbs",
    "systems/sla-industries/templates/item/parts/item-attributes-tab.hbs",
    "systems/sla-industries/templates/item/parts/item-description-tab.hbs",
    "systems/sla-industries/templates/item/parts/item-tabs-nav.hbs",
    "systems/sla-industries/templates/actor/parts/combat-tab.hbs",
    "systems/sla-industries/templates/chat/chat-damage-result.hbs",
    "systems/sla-industries/templates/actor/parts/combat-loadout.hbs",
    "systems/sla-industries/templates/item/parts/item-explosive.hbs"
  ];

  // Load the template parts
  return foundry.applications.handlebars.loadTemplates(templatePaths);
};