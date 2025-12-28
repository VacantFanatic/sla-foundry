# CHANGELOG

# v0.14.0

### Features
*   **Ebb Disciplines:** Corrected the list of Ebb Disciplines in the configuration to match the official list (Awareness, Blast, Communicate, Enhance, Heal, Protect, Reality Fold, Senses, Telekinesis, Thermal).
*   **World Item Sync:** Implemented a robust sync mechanism to ensure World Items in the "SLA Species" folder are automatically updated with the correct skills and statistics.
*   **Quick Start Gear:** Added a new Compendium Pack "Quick Start Gear" containing a selection of pre-statted weapons and armor for quick character creation.
*   **Config Cleanup:** Removed legacy `speciesStats` and `species` helper lists from `config.mjs` as the system now relies entirely on Compendium Items for species data.

### Bug Fixes
*   Fixed a syntax error in `config.mjs` that prevented character sheets from loading.
*   Ensured the "Human" species item is correctly created if missing.
*   Resolved a syntax error in `actor.mjs` caused by a missing brace during code cleanup.
*   Updated `.gitignore` to properly ignore local LevelDB cache folders in `packs/` while preserving the source `.db` files.


# v0.13.2-alpha
    
## Fixes
- **Critical Crash**: Fixed a crash that occurred when applying encumbrance penalties to actors (Threats) that lacked the necessary data structures.
- **Threat Armor PV**: Fixed a bug where missing `ratings` data on Threats prevented ANY derived stats (including Armor PV) from being calculated.
- **PV Display**: Updated the Threat Sheet to correctly display the calculated effective Armor PV.

# v0.13.1-alpha

## Fixes
- **Weapon Firing Modes**: Fixed an issue where the "Enable" toggle for firing modes in the Item Sheet was unclickable.
- **Threat Armor PV**: Threats (NPCs) now automatically derive their Protection Value (PV) from equipped armor, and respect armor degradation rules.
- **Threat Movement**: Fixed an issue where Threat movement speeds would reset to 0 upon update.

# v0.13.0-alpha

## Highlights
- **User Interface Overhaul**: Major redesign of all Item Sheets with distinct "in-universe" themes (Catalogue, Textbook, Spectral, Dossier).
- **Threat Sheets**: Dedicated visual identity for NPC/Threat sheets with a toxic green schema.

## What's new
- **Item Sheet Themes**: 
  - **Catalogue** (Weapons, Armor, Gear): Industrial aesthetics with clear grids.
  - **Textbook** (Skills, Traits): "Academic Paper" style with white background and serif fonts details.
  - **Spectral** (Ebb, Discipline): Dark, glowing purple aesthetic for Ebb-related items.
  - **Dossier** (Species, Package): Secret classified folder look.
- **Improved Layouts**: 
  - **Single View**: streamlined layouts for singular items removing tabs in favor of a vertical flow (Attributes -> Drop Zone -> Description).
  - **Custom Grids**: Specific 2-column layouts for Drugs and compact 2x2 grids for Ebb Formulas.
  - **Paneling**: Moved "Powered Armor" and "Firing Modes" to dedicated bottom panels for better organization.
- **Explosives**:
  - **Refinement**: Added dual-template support (Kill Zone vs Max Blast) and auto-deletion on empty quantity.

# v0.12.0-alpha

## Highlights
- **Explosives System**: Full implementation of Grenades and Explosives with automated rolling, deviation, and template placement.

## What's new
- **New Item Type: Explosive**: Created a dedicated item type for explosives with properties for Blast Radius (Inner/Outer), Damage, AD, and Cost.
- **Automated Grenade Physics**:
  - **Auto-Aim**: Players click on the canvas to select a target point.
  - **Deviation**: Automatically calculates if the grenade lands on target, deviates 5m/10m, or fumbles (detonates on user).
  - **Dual Templates**: Automatically places Measured Templates on the scene. Draws a darker "Kill Zone" inner circle and a lighter "Max Blast" outer circle.
- **Inventory Management**:
  - **Quantity Tracking**: Explosives show quantity (e.g., x3) in the Combat Tab.
  - **Auto-Delete**: Items are automatically removed from inventory when quantity reaches 0.

## Fixes
- **Ray Deprecation**: Resolved `Ray` global deprecation warning for Foundry V13+.
- **Token Range**: Fixed an issue where range calculations would fail if the actor's token wasn't correctly identified.


# v0.10.3-alpha

## What's new
- **Armor Upgrade**: Added support for Powered Armor with toggleable modifiers for STR, DEX, and Movement.
- **Dead Weight**: Implemented rule where Powered Armor becomes weight 6 if Resistance is destroyed.
- **Dead Condition**: Automatically applies the "Dead" status overlay when HP reaches 0 and removes it when healed.

## Fixes & Improvements
- **Armor Damage (AD)**: Improved damage calculation logic. AD now reduces armor resistance *before* the PV is calculated for the hit, ensuring damaged armor provides less protection immediately.
- **Migration**: Added a migration script to initialize new armor fields for existing items.

# v0.10.0-alpha

## What's new
- **Visual Overhaul**: Significant styling updates for Character and Threat sheets, ensuring high contrast and better visibility.
- **Editor Improvements**: Fixed invisible editor buttons (ProseMirror) on dark backgrounds. Restored the minimum height for Threat sheet notes.
- **Dossier Theme**: Added styling for Species and Package item sheets for a distinct "Dossier" look.
- **Chat Styling**: Updated the Damage Result chat card to match the dark SLA Industries theme.

## Fixes
- Fixed item sheet template partials missing CSS classes.

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
