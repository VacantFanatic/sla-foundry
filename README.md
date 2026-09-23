# SLA Industries 2nd Edition — Foundry VTT System

![Version](https://img.shields.io/badge/version-2.12.0-orange)
![Foundry VTT](https://img.shields.io/badge/Foundry%20VTT-v14-informational)
![License: MIT](https://img.shields.io/badge/license-MIT-blue)

A custom game system implementation for playing **SLA Industries 2nd Edition** on Foundry Virtual
Tabletop. This system features a high-contrast dark UI, automated combat mechanics, and
drag-and-drop character creation tools.

## Contents

- [Key Features](#key-features)
- [Installation](#installation)
- [Recommended Modules](#recommended-modules-optional)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License & Credits](#license--credits)

## Key Features

### Character Sheet

- **Custom UI:** A "Dark/Orange" high-contrast theme (`#1a1a25` background) designed to match the
  _SLA Industries_ aesthetic.
- **Tabbed Navigation:** Organized sections for Stats, Skills, Combat, Inventory, and Biography.
- **Rich Text Editors:** Full support for HTML/Text editing in Biographies, Notes, and Item
  descriptions.
- **Languages:** English and French UI translations ship with the system.

### Automation & Mechanics

- **Species & Packages:**
    - Drag-and-drop a **Species** item (e.g., _Shaktar_, _Ebonite_) to automatically set Base Stats,
      Movement Rates, HP, and starting Skills.
    - Drag-and-drop a **Package** to apply training package requirements and bonus skills.
- **Combat & Weaponry:**
    - **Firing Modes:** Weapons support specific modes (Single, Burst, Full-Auto, Suppressive).
    - **Ammo & Recoil:** The system automatically tracks ammo usage per mode and applies the correct
      Recoil penalty to the dice pool.
    - **Low Ammo Logic:** Prevents firing high-cost modes if ammo is insufficient, or applies a
      **-2 Damage** penalty if emptying the clip on the lowest mode.
    - **Shields:** Armor items can be flagged as shields with independent Melee/Ranged PV and
      Resistance, applied only when a Shield Craft check succeeds on that hit.
    - **Melee Combat:**
        - **Reserve Dice:** Players can manually reserve combat dice to lower their attack pool for
          later defense (Combat/Acrobatic Defense).
        - **Target Defense:** Input fields to subtract target's Combat Defense (-1/point) or
          Acrobatics (-2/rank) from the attacker's pool.
- **Inventory Management:**
    - **Drugs:** Dedicated "Consume" button in the inventory that reduces quantity and posts an
      effect card to chat.
    - **Reloading:** Context-aware reload button that checks your inventory for matching magazines.
- **The Ebb:**
    - Support for **Flux** tracking.
    - Discipline and Formula rolls calculate Success Die + Skill Dice automatically.
- **Active Effects:**
    - Operatives have an **Effects** tab and support Foundry **Active Effects** for temporary
      modifiers (e.g. drugs, poison, stance) and a persistent roll modifier. See
      [`.docs/DEVELOPER.md`](.docs/DEVELOPER.md#active-effects-and-stats) for setup details.
- **Compendiums:** Ships with pre-built packs for Skills, Traits, Species, Disciplines,
  Quick Start Gear, and Vehicles. Entries provide names and mechanical values only (rank, stat,
  XP cost, etc.) — description/rules text fields are intentionally left blank, since that content
  is copyrighted by Nightfall Games and is not reproduced here. You'll need the _SLA Industries
  2nd Edition_ rulebook to fill in or reference the full text for each entry.

### What stays manual at the table

- **Treatment rolls** (e.g. for diseases/toxicants): items may store **Treatment Rating** and
  **Treatment** notes for reference, but the system does **not** automate treatment rolls or
  recovery.
- **Addiction tests**: drugs can record **Addiction Rating** and **Addiction Dose** text on the
  item sheet; the system does **not** roll or track addiction tests. Resolve those manually (or
  with macros) per your table.

## Installation

1. In Foundry VTT, go to **Game Systems** → **Install System** and search for "SLA Industries", or
   paste the manifest URL below.
2. Alternatively, download the release `.zip` and extract it into your Foundry VTT
   `Data/systems/` directory, then rename the folder to `sla-industries`.
3. Create or launch a world using the **SLA Industries 2nd Edition** system.

Requires **Foundry VTT v14** (verified against `14.367`).

## Recommended modules (optional)

The system runs without add-ons. These community modules are commonly paired with it:

- **[Tokenizer](https://foundryvtt.com/packages/vtta-tokenizer/)** — In-game portrait and token
  editor (layers, masks, framing). Useful for operatives and NPCs; open it from the actor's image
  where Foundry and the module expose that control.
- **[Autocomplete Inline Properties](https://foundryvtt.com/packages/autocomplete-inline-properties/)**
  — Autocomplete and browsing for **Active Effect** attribute keys and other inline property
  fields. Helpful when configuring stat bonus effects; see
  [Active Effects and stats](.docs/DEVELOPER.md#active-effects-and-stats) in the developer guide
  for attribute key conventions.

## Manifest

```
https://github.com/VacantFanatic/sla-foundry/releases/latest/download/system.json
```

## Documentation

- **Players & GMs:** the [project wiki](https://github.com/VacantFanatic/sla-foundry/wiki) covers
  gameplay usage. Several of those pages are also maintained as source markdown in this repo:
  [`.docs/EBB_SYSTEM.md`](.docs/EBB_SYSTEM.md) (Ebb powers),
  [`.docs/WORLD_SETTINGS.md`](.docs/WORLD_SETTINGS.md) (every world setting), and
  [`.docs/item_setup.md`](.docs/item_setup.md) (drag-and-drop item linking).
- **Contributors:** see [CONTRIBUTING.md](CONTRIBUTING.md) for the dev workflow and
  [`.docs/DEVELOPER.md`](.docs/DEVELOPER.md) for architecture, data models, and the public API.
  [CLAUDE.md](CLAUDE.md) has a full map of every doc in the repo.
- **Releases:** [CHANGELOG.md](CHANGELOG.md) tracks release history;
  [`.docs/RELEASE.md`](.docs/RELEASE.md) documents the release process and version numbering.

## Contributing

Bug reports, mechanic implementations, style fixes, and doc updates are all welcome. See
[CONTRIBUTING.md](CONTRIBUTING.md) for the branching model, TDD workflow, and how to open a pull
request. Please review [SECURITY.md](SECURITY.md) before reporting a security vulnerability.

## License & Credits

This system is an unofficial fan creation, licensed under the [MIT License](LICENSE.txt).

- **Game System:** Based on _SLA Industries 2nd Edition_ by Nightfall Games.
- **Code:** Built on the Foundry VTT Boilerplate system.
- **Compendium content:** The MIT license covers this system's code only. The bundled
  compendium packs (Skills, Traits, Species, Disciplines, Quick Start Gear, Vehicles) contain
  names and mechanical values only — no descriptive/rules text from the rulebook is included,
  since that content is copyrighted by Nightfall Games. You will need a copy of _SLA Industries
  2nd Edition_ to use these entries at the table.
