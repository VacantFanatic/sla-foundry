/**
 * Define a set of template paths to pre-load
 */
export const preloadHandlebarsTemplates = async function() {

  // Define template paths as an array of strings
  const templatePaths = [
    "systems/sla-industries/templates/partials/header.hbs",
    "systems/sla-industries/templates/partials/stats.hbs",
    "systems/sla-industries/templates/partials/skills.hbs",
    "systems/sla-industries/templates/partials/traits.hbs",
    "systems/sla-industries/templates/partials/secondary.hbs",
    "systems/sla-industries/templates/partials/wounds.hbs",
    "systems/sla-industries/templates/partials/inventory.hbs",
	"systems/sla-industries/templates/partials/ebb.hbs",
	"systems/sla-industries/templates/partials/disciplines.hbs",
	"systems/sla-industries/templates/chat/chat-weapon-rolls.hbs",
	"systems/sla-industries/templates/chat/chat-damage.hbs",
	"systems/sla-industries/templates/partials/ebb-drop-zone.hbs"
  ];

  // Load the template parts
  return loadTemplates(templatePaths);
};