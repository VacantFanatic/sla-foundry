# SLA Industries 2nd Edition - Foundry VTT System

A custom game system implementation for playing **SLA Industries 2nd Edition** on Foundry Virtual Tabletop. This system features a high-contrast dark UI, automated combat mechanics, and drag-and-drop character creation tools.

🌟 Key Features

### Character Sheet

- **Custom UI:** A "Dark/Orange" high-contrast theme (`#1a1a25` background) designed to match the *SLA Industries* aesthetic.
- **Tabbed Navigation:** Organized sections for Stats, Skills, Combat, Inventory, and Biography.
- **Rich Text Editors:** Full support for HTML/Text editing in Biographies, Notes, and Item descriptions.

### 🎥 Automation & Mechanics

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
  - Operatives have an **Effects** tab and support Foundry **Active Effects** for temporary modifiers (e.g. drugs, poison, stance). See [Configuring Active Effects](#configuring-active-effects) below.

### What stays manual at the table

- **Treatment rolls** (e.g. for diseases/toxicants): items may store **Treatment Rating** and **Treatment** notes for reference, but the system does **not** automate treatment rolls or recovery.
- **Addiction tests**: drugs can record **Addiction Rating** and **Addiction Dose** text on the item sheet; the system does **not** roll or track addiction tests. Resolve those manually (or with macros) per your table.

## 🛠️ Installation

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

## ⚙️ Setup Guide

[https://github.com/VacantFanatic/sla-foundry/blob/main/item_setup.md](https://github.com/VacantFanatic/sla-foundry/blob/main/item_setup.md)

## 🎲 Usage Guide

### Character Creation

1. Create a new Actor (Type: `Character`).
2. Open the **Compendium Packs** and find **SLA Species**.
3. Drag a Species (e.g., *Human*) onto the sheet. This will:
  - Set Min/Max Stats.
    - Set Base HP and Movement.
    - Add starting Skills (Rank 1).
4. Manually adjust stats within the Min/Max limits.

### Combat Rolls

1. Click the **Die Icon** next to a weapon in the "Combat" tab.
2. **Ranged:** Select your Firing Mode from the dropdown. The system will calculate modifiers based on Recoil, Cover, and Range.
3. **Melee:** Enter any **Reserved Dice** you wish to withhold for defense. Enter the target's Defense ratings if known.
4. Click **Roll**. The result will show:
  - **Success Die** (Black/White).
    - **Skill Dice** (Matches or Hits).
    - **Margin of Success (MOS)** effects (e.g., +Damage or Headshots).

### Drugs & Consumables

1. Add a Drug item (e.g., *Shatter*) to your inventory.
2. Click the **Syringe Icon**  on the item line.
3. This consumes 1 dose and prints the drug's Duration and Effects to the chat log for reference.
4. If the drug has **embedded Active Effects** (item **Effects** tab), those are applied to the actor while active; older items may still use the built-in **stat mod** fields, which the system maps onto Active Effects for you.

### Configuring Active Effects

Use the operative’s **Effects** tab or define effects on items (e.g. drugs, toxicants) via the item’s **Effects** tab. When an effect is enabled, the sheet’s **Play** mode (header switch to the **right**, **P**) shows **effective** stats after modifiers; **Edit** mode (switch to the **left**, **E**) shows the **base** scores you enter on the sheet. Click the switch to flip between the two.

**Recommended modules:** See [Recommended modules (optional)](#recommended-modules-optional) for **Autocomplete Inline Properties** (Active Effect **Attribute Key** paths and other inline fields) and **Tokenizer** (token/portrait art). Both are optional; this system works without them.

#### Core stats (STR, DEX, KNOW, CONC, CHA, COOL)

- **Attribute key (preferred):** `system.stats.<stat>.bonus` where `<stat>` is `str`, `dex`, `know`, `conc`, `cha`, or `cool`.
- **Change mode:** **Add**.
- **Value:** use a positive or negative integer (e.g. `-1` to penalize STR by 1).

The **base** value on the sheet (`system.stats.<stat>.value`) is what you edit; **bonus** is the channel for temporary modifiers so the base field is not overwritten by effects.

**Legacy:** **Add** on `system.stats.<stat>.value` is still read and folded into the same effective total, but new effects should use `**.bonus`**.

#### Other supported keys

- **Damage reduction (stacking add):** `system.wounds.damageReduction` — mode **Add**, numeric value (used by legacy drug DR; same path for custom effects if you want that behavior).

#### Not automated

- **Treatment** and **addiction** mechanics are **not** rolled by the system. Use the fields on drug/toxicant items for notes and ratings, then handle tests manually.

#### Conditions (status icons)

Foundry **status effects** on the token/actor (e.g. bleeding, prone) tie into the sheet’s condition toggles where the system implements them. Add or configure those like any other Foundry Active Effect with the appropriate status.

## ⚖️ License & Credits

This system is an unofficial fan creation.

- **Game System:** Based on *SLA Industries 2nd Edition* by Nightfall Games.
- **Code:** Built on the Foundry VTT Boilerplate system.

