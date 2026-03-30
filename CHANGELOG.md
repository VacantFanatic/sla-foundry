# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.1.0] - 2026-03-30

### Added
* Operative (character) weapon attack rolls require the weapon to be equipped; attempting an attack while it is stowed shows a random in-character reminder instead of opening the attack dialog (issue 212). Threat (NPC) sheets are unchanged.

### Changed
* Updated system version to `1.1.0`.

## [1.0.4] - 2026-03-30

### Changed
* Updated system version to `1.0.4`.

### Fixed
* Actor sheet portrait fills the center column again: scoped shared header image rules so they no longer shrink nested portraits to 100×100px (issue 214).

## [1.0.3] - 2026-03-30

### Changed
* Updated system version to `1.0.3`.

### Fixed
* Improved Threat sheet Notes editor toolbar contrast so controls are visible in the light Notes panel.
* Fixed Threat sheet Notes persistence by binding the editor to `system.notes` and adding NPC HTML fields used by the editor.

## [1.0.2] - 2026-03-30

### Fixed
* Fixed Threat sheet armor resistance value inputs being too light grey to read (issue 211).

## [1.0.1] - 2026-01-16

### Changed
* Updated system metadata for the `1.0.1` release in `system.json`, including the release download URL.
* Refined dialog and chat styling in SCSS to improve UI consistency and readability.
* Renamed project display metadata to align with SLA Industries naming.

### Removed
* Removed obsolete files as part of release cleanup.

## [1.0.0] - 2026-01-13

### Changed
* Updated system version and release download URL in `system.json` for the `1.0.0` release.

### Removed
* Removed the outdated `packages.db` file from the project.

## [0.24.0]

### Added
* Optional long range feature setting to toggle long range penalties.
* Optional target-required feature setting to allow attacks without selecting a target.
* Optional automatic ammo consumption setting.
* Optional low ammo validation setting.
* Optional automatic wound penalties setting.
* Optional NPC wound tracking setting, including NPC sheet visibility behavior.

## [0.20.1]

### Fixed
* Melee weapon roll calculations now use STR instead of always using DEX.
* Double-application of Combat Defense and Acrobatic Defense penalties in melee attacks.

## [0.20.0]

### Added
* Clickable Species, Package, and Skills headers on actor sheets for direct Compendium navigation.

### Fixed
* Migration version synchronization.

## [0.19.2]

### Added
* GM-visible Skill Check chat card buttons to adjust TN after rolls.
* Quick-roll "bolt" icon for Ebb Formulas on actor sheets.

### Changed
* Button styling and hover behavior for target number adjustment controls.
* Default global target number changed from `11` to `10`.
* Roll UI logic now restricts tactical/difficulty controls to appropriate roll types.

### Fixed
* Ebb modifier string concatenation issue in Ebb rolls.
* Ebb formula nesting under Disciplines.
* Combat defense modifier application in the Melee Attack Dialog.
* Migration version synchronization.

## [0.19.0]

### Added
* Functional melee defense inputs for Target Combat Defense, Acrobatic Defense, and Prone status.
* GM-visible post-roll Target Number adjustment buttons for Weapon/Skill chat cards.

### Fixed
* System-wide target number corrected from `11` to `10`.

## [0.14.2]

### Added
* Calculated weapon damage display on Threat sheets, matching Character sheet behavior.
* Automatic startup migration for legacy natural weapons.

## [0.14.1]

### Added
* Automatic minimum damage enforcement for weapon rolls.
* Calculated combat loadout damage display instead of raw formulas.
* Migration for legacy natural weapon formulas (`1d10` to STR-based formulas).

## [0.14.0]

### Added
* Quick Start Gear compendium pack.
* World item sync mechanism for SLA Species folder data consistency.

### Changed
* Ebb Disciplines configuration updated to match the official discipline list.

### Removed
* Legacy `speciesStats` and `species` helper lists from `config.mjs`.

### Fixed
* Syntax error in `config.mjs` blocking character sheets.
* Missing Human species item creation.
* Syntax error in `actor.mjs` caused by a missing brace.
* `.gitignore` handling for local LevelDB cache folders in `packs/`.

## [0.13.2-alpha]

### Fixed
* Crash when applying encumbrance penalties to Threat actors missing required data structures.
* Threat derived-stat calculation failure when `ratings` data was missing.
* Threat sheet Armor PV display to show calculated effective value.

## [0.13.1-alpha]

### Fixed
* Unclickable firing mode "Enable" toggle in item sheets.
* Threat PV derivation from equipped armor with degradation rules.
* Threat movement speeds resetting to `0` on update.

## [0.13.0-alpha]

### Added
* Major in-universe item sheet theming (Catalogue, Textbook, Spectral, Dossier).
* Dedicated visual identity for Threat sheets.
* Streamlined single-view layouts for singular items.
* Specialized grid layouts for Drugs and Ebb Formulas.
* Reorganized powered armor and firing modes into dedicated lower panels.
* Explosive refinement with dual-template support (Kill Zone and Max Blast) and auto-delete on empty quantity.

## [0.12.0-alpha]

### Added
* Full explosives system with grenade automation, deviation, and template placement.
* Dedicated Explosive item type with blast radius, damage, AD, and cost fields.
* Canvas target-point auto-aim for grenades.
* Automatic deviation and fumble behavior for grenade throws.
* Dual measured templates for kill and max blast zones.
* Explosive quantity tracking in the Combat tab.
* Auto-deletion of explosive items when quantity reaches zero.

### Fixed
* `Ray` global deprecation warning compatibility for Foundry V13+.
* Range calculation failure when actor token resolution was incorrect.

## [0.10.3-alpha]

### Added
* Powered armor support with STR/DEX/Movement modifiers.
* Powered armor dead weight rule when resistance is destroyed.
* Automatic "Dead" overlay application/removal based on HP.

### Changed
* Armor Damage handling now applies AD reduction before PV is calculated.

### Fixed
* Migration added to initialize new armor fields for existing items.

## [0.10.0-alpha]

### Added
* Character and Threat sheet visual overhaul for improved contrast and readability.
* Dossier theme styling for Species and Package item sheets.
* Dark-theme chat styling for damage result cards.

### Fixed
* Invisible ProseMirror editor controls on dark backgrounds.
* Threat sheet notes minimum height behavior.
* Missing CSS classes in item sheet template partials.

## [0.9.3-alpha]

### Added
* `SlaActorSheet` with expanded character management and roll tooling.
* Wound and condition tracking with derived penalty automation.
* SCSS-based styling system migration.

### Fixed
* Deprecation warnings for `renderTemplate` and `Hooks.on("renderChatMessage")`.
* Condition penalty behavior restoration.
* Damage button failure after Luck usage.

### Changed
* Default stats initialization changed from `10` to `1`.
* Formatting updates to `template.json`.

## [0.8.3-alpha]

### Added
* Luck dialog for rerolls and modifier application.
* Initial character sheet styling.

## [0.7.3-alpha]

### Added
* Roll icons for Threat attributes and related roll entry points.
* Weapon attack type support with migration logic.

### Fixed
* Ammo handling bug.

## [0.4.4-alpha]

### Added
* Reserved dice option in melee attack dialog.
* Drug consumption feature and corresponding drug item field updates.

## [0.4.2-alpha]

### Added
* Weapon reload logic and ammo type selector.
* Threat sheet theme and NPC sheet layout improvements.

## [0.3.1-alpha]

### Added
* Ebb discipline linking.
* Combat loadout refactor into partial templates.
* Dark theme updates.

## [0.2.5-alpha]

### Added
* Office Dossier theme for Species and Package items.
* Combat fields for Ebb Formula item sheets.

## [0.2.3-alpha]

### Fixed
* (#18) Ratings points issue.

## [0.2.2-alpha]

### Fixed
* (#13) Skill drops not working.
* (#10) Roll dialog options/readability issues.
* (#8) Damage modifier review and corrections.

## [0.1.0-alpha]

### Added
* Droppable Species and Package items for initial character setup.
* Initial attributes and skills assignment from dropped setup items.
* Skill rank increment when granted by both Species and Package.
* Hidden cost display for skills and non-gear items.
* Skill maximum cap (rank 4).
* Skill-drop areas for Species and Package items instead of plain text fields.

### Fixed
* Ranged weapon attack modifier regression.
* Stunned status toggle getting stuck.
* Damage application targeting both selected token and target.
* Degree of success display regression on weapon attacks.

[1.1.0]: https://github.com/VacantFanatic/sla-foundry/releases/tag/1.1.0
[1.0.1]: https://github.com/VacantFanatic/sla-foundry/releases/tag/1.0.1
[1.0.0]: https://github.com/VacantFanatic/sla-foundry/releases/tag/1.0.0
[0.24.0]: https://github.com/VacantFanatic/sla-foundry/releases/tag/0.24.0
[0.20.1]: https://github.com/VacantFanatic/sla-foundry/releases/tag/0.20.1
[0.20.0]: https://github.com/VacantFanatic/sla-foundry/releases/tag/0.20.0
[0.19.2]: https://github.com/VacantFanatic/sla-foundry/releases/tag/0.19.2
[0.19.0]: https://github.com/VacantFanatic/sla-foundry/releases/tag/0.19.0
[0.14.2]: https://github.com/VacantFanatic/sla-foundry/releases/tag/0.14.2
[0.14.1]: https://github.com/VacantFanatic/sla-foundry/releases/tag/0.14.1
[0.14.0]: https://github.com/VacantFanatic/sla-foundry/releases/tag/0.14.0
[0.13.2-alpha]: https://github.com/VacantFanatic/sla-foundry/releases/tag/0.13.2-alpha
[0.13.1-alpha]: https://github.com/VacantFanatic/sla-foundry/releases/tag/0.13.1-alpha
[0.13.0-alpha]: https://github.com/VacantFanatic/sla-foundry/releases/tag/0.13.0-alpha
[0.12.0-alpha]: https://github.com/VacantFanatic/sla-foundry/releases/tag/0.12.0-alpha
[0.10.3-alpha]: https://github.com/VacantFanatic/sla-foundry/releases/tag/0.10.3-alpha
[0.10.0-alpha]: https://github.com/VacantFanatic/sla-foundry/releases/tag/0.10.0-alpha
[0.9.3-alpha]: https://github.com/VacantFanatic/sla-foundry/releases/tag/0.9.3-alpha
[0.8.3-alpha]: https://github.com/VacantFanatic/sla-foundry/releases/tag/0.8.3-alpha
[0.7.3-alpha]: https://github.com/VacantFanatic/sla-foundry/releases/tag/0.7.3-alpha
[0.4.4-alpha]: https://github.com/VacantFanatic/sla-foundry/releases/tag/0.4.4-alpha
[0.4.2-alpha]: https://github.com/VacantFanatic/sla-foundry/releases/tag/0.4.2-alpha
[0.3.1-alpha]: https://github.com/VacantFanatic/sla-foundry/releases/tag/0.3.1-alpha
[0.2.5-alpha]: https://github.com/VacantFanatic/sla-foundry/releases/tag/0.2.5-alpha
[0.2.3-alpha]: https://github.com/VacantFanatic/sla-foundry/releases/tag/0.2.3-alpha
[0.2.2-alpha]: https://github.com/VacantFanatic/sla-foundry/releases/tag/0.2.2-alpha
[0.1.0-alpha]: https://github.com/VacantFanatic/sla-foundry/releases/tag/0.1.0-alpha
