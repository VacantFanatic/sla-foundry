# CHANGELOG

# v0.9.3-alpha

## What's new
- **New Actor Sheet**: Introduced `SlaActorSheet` for comprehensive character management, including better item organization, skill/attribute/combat rolls, and condition toggling.
- **Wounds & Conditions**: Implemented actor wound tracking, condition management (e.g., Stunned, Immobile), and automatic application of derived stat penalties from wounds and encumbrance.
- **Styling Overhaul**: Converted CSS to SCSS and implemented a new styling system.

## Fixes & Improvements
- Fixed deprecation warnings for `renderTemplate` and `Hooks.on("renderChatMessage")`.
- Restored condition penalties functionality.
- Initialized default stats to 1 instead of 10.
- Fixed an issue where the damage button wouldn't work after using Luck.
- formatting updates to `template.json`.

# v0.8.3-alpha

## What's new
- **Luck System**: Added a new Luck Dialog for rerolling dice and applying modifiers.
- **Initial Styling**: Added initial character sheet styling.

# v0.7.3-alpha

## What's new
- **Roll Icons**: Added roll icons to Threat attributes and other areas.

## Fixes
- Fixed ammo bug.
- Added weapon attack type and migration logic.

# v0.4.4-alpha

## What's new
- **Reserved Dice**: Added reserved dice option to melee attack dialog.
- **Drugs**: Added drug consumption feature and updated drug item fields.

# v0.4.2-alpha

## What's new
- **Weapons**: Added reload logic and ammo type selector.
- **Threat Sheets**: Added threat sheet theme and improved NPC sheet layout.

# v0.3.1-alpha

## What's new
- **Ebb Disciplines**: Added Ebb discipline linking.
- **Combat Loadout**: Refactored combat loadout to partial template.
- **Dark Theme**: Updates to the dark theme.

# v0.2.5-alpha

## What's new
- **Office Dossier**: Added Office Dossier theme for species and package items.
- **Ebb Formulas**: Added combat fields to Ebb Formula item sheet.

# v0.2.3-alpha

## Bugs
- (#18)Fix Ratings Points

# v0.2.2-alpha

## Bugs
- (#13) Skill Drops not working
- (#10) Fix roll diaglog options and readibility
- (#8) Review and correct damage modifiers

# v0.1.0-alpha
 
## What's new
- Added droppable items for package and species
  - These will set initial attributes
  - Initial skills
  - If a skill is granted by package and species it will increase the rank by 1
- Hide cost from skills, and non-gear items
- Added a skill max (rank 4)
- Make the skills for species and package an area to drop skill items instead of a text field

## Bugs
- Ranged mods on a weapon attack are gone - repair
- Fix status toggles stunned gets stuck
- Apply damage is applying damage to target and selected token - add selector to confirmation dialog
- Degree of success on weapon attacks is gone - restored
