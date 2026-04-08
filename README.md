# SLA Industries 2nd Edition - Foundry VTT System

A custom game system implementation for playing **SLA Industries 2nd Edition** on Foundry Virtual Tabletop. This system features a high-contrast dark UI, automated combat mechanics, and drag-and-drop character creation tools.

Key Features

### Character Sheet

- **Custom UI:** A "Dark/Orange" high-contrast theme (`#1a1a25` background) designed to match the *SLA Industries* aesthetic.
- **Tabbed Navigation:** Organized sections for Stats, Skills, Combat, Inventory, and Biography.
- **Rich Text Editors:** Full support for HTML/Text editing in Biographies, Notes, and Item descriptions.

### Automation & Mechanics

- **Species & Packages:**
  - Drag-and-drop a **Species** item (e.g., *Shaktar*, *Ebonite*) to automatically set Base Stats, Movement Rates, HP, and starting Skills.
  - Drag-and-drop a **Package** to apply training package requirements and bonus skills.
- **Combat & Weaponry:**
  - **Firing Modes:** Weapons support specific modes (Single, Burst, Full-Auto, Suppressive).
  - **Ammo & Recoil:** The system automatically tracks ammo usage per mode and applies the correct Recoil penalty to the dice pool.
  - **Low Ammo Logic:** Prevents firing high-cost modes if ammo is insufficient, or applies a **-2 Damage** penalty if emptying the clip on the lowest mode.
  - **Melee Combat:**
    - **Reserve Dice:** Players can manually reserve combat dice to lower their attack pool for later defense (Combat/Acrobatic Defense).
    - **Target Defense:** Input fields to subtract target's Combat Defense (-1/point) or Acrobatics (-2/rank) from the attacker's pool.
- **Inventory Management:**
  - **Drugs:** Dedicated "Consume" button  in the inventory that reduces quantity and posts an effect card to chat.
  - **Reloading:** Context-aware reload button that checks your inventory for matching magazines.
- **The Ebb:**
  - Support for **Flux** tracking.
  - Discipline and Formula rolls calculate Success Die + Skill Dice automatically.
- **Active Effects:**
  - Operatives have an **Effects** tab and support Foundry **Active Effects** for temporary modifiers (e.g. drugs, poison, stance). See the wiki for setup details.

### What stays manual at the table

- **Treatment rolls** (e.g. for diseases/toxicants): items may store **Treatment Rating** and **Treatment** notes for reference, but the system does **not** automate treatment rolls or recovery.
- **Addiction tests**: drugs can record **Addiction Rating** and **Addiction Dose** text on the item sheet; the system does **not** roll or track addiction tests. Resolve those manually (or with macros) per your table.

## Installation

1. Download the system files.
2. Extract the folder into your Foundry VTT `Data/systems/` directory.
3. Rename the folder to `sla-industries`.
4. Restart Foundry VTT.

## Recommended modules (optional)

The system runs without add-ons. These community modules are commonly paired with it:

- **[Tokenizer](https://foundryvtt.com/packages/vtta-tokenizer/)** — In-game portrait and token editor (layers, masks, framing). Useful for operatives and NPCs; open it from the actor’s image where Foundry and the module expose that control.
- **[Autocomplete Inline Properties](https://foundryvtt.com/packages/autocomplete-inline-properties/)** — Autocomplete and browsing for **Active Effect** attribute keys and other inline property fields. Helpful if you use the guidance in [Configuring Active Effects](#configuring-active-effects) below.

## Manifest

[https://github.com/VacantFanatic/sla-foundry/releases/latest/download/system.json](https://github.com/VacantFanatic/sla-foundry/releases/latest/download/system.json)

## Wiki Documentation

Project wiki pages for users and contributors are available on GitHub:

- [https://github.com/VacantFanatic/sla-foundry/wiki](https://github.com/VacantFanatic/sla-foundry/wiki)

If you are working directly from this repository, the source markdown for those pages is under:

- [`.docs/wiki/`](.docs/wiki/)

##  License & Credits

This system is an unofficial fan creation.

- **Game System:** Based on *SLA Industries 2nd Edition* by Nightfall Games.
- **Code:** Built on the Foundry VTT Boilerplate system.

