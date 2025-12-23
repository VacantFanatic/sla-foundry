# SLA Industries 2nd Edition - Foundry VTT System

A custom game system implementation for playing **SLA Industries 2nd Edition** on Foundry Virtual Tabletop. This system features a high-contrast dark UI, automated combat mechanics, and drag-and-drop character creation tools.

🌟 Key Features

### Character Sheet
* **Custom UI:** A "Dark/Orange" high-contrast theme (`#1a1a25` background) designed to match the *SLA Industries* aesthetic.
* **Tabbed Navigation:** Organized sections for Stats, Skills, Combat, Inventory, and Biography.
* **Rich Text Editors:** Full support for HTML/Text editing in Biographies, Notes, and Item descriptions.

### 🎥 Automation & Mechanics
* **Species & Packages:**
    * Drag-and-drop a **Species** item (e.g., *Shaktar*, *Ebonite*) to automatically set Base Stats, Movement Rates, HP, and starting Skills.
    * Drag-and-drop a **Package** to apply training package requirements and bonus skills.

* **Combat & Weaponry:**
    * **Firing Modes:** Weapons support specific modes (Single, Burst, Full-Auto, Suppressive).
    * **Ammo & Recoil:** The system automatically tracks ammo usage per mode and applies the correct Recoil penalty to the dice pool.
    * **Low Ammo Logic:** Prevents firing high-cost modes if ammo is insufficient, or applies a **-2 Damage** penalty if emptying the clip on the lowest mode.
    * **Melee Combat:**
        * **Reserve Dice:** Players can manually reserve combat dice to lower their attack pool for later defense (Combat/Acrobatic Defense).
        * **Target Defense:** Input fields to subtract target's Combat Defense (-1/point) or Acrobatics (-2/rank) from the attacker's pool.

* **Inventory Management:**
    * **Drugs:** Dedicated "Consume" button (<i class="fas fa-syringe"></i>) in the inventory that reduces quantity and posts an effect card to chat.
    * **Reloading:** Context-aware reload button that checks your inventory for matching magazines.

* **The Ebb:**
    * Support for **Flux** tracking.
    * Discipline and Formula rolls calculate Success Die + Skill Dice automatically.

## 🛠️ Installation

1.  Download the system files.
2.  Extract the folder into your Foundry VTT `Data/systems/` directory.
3.  Rename the folder to `sla-industries`.
4.  Restart Foundry VTT.

## Manifest
https://github.com/VacantFanatic/sla-foundry/releases/latest/download/system.json
  
## ⚙️ Setup Guide
https://github.com/VacantFanatic/sla-foundry/blob/main/item_setup.md

## 🎲 Usage Guide

### Character Creation
1.  Create a new Actor (Type: `Character`).
2.  Open the **Compendium Packs** and find **SLA Species**.
3.  Drag a Species (e.g., *Human*) onto the sheet. This will:
    * Set Min/Max Stats.
    * Set Base HP and Movement.
    * Add starting Skills (Rank 1).
4.  Manually adjust stats within the Min/Max limits.

### Combat Rolls
1.  Click the **Die Icon** next to a weapon in the "Combat" tab.
2.  **Ranged:** Select your Firing Mode from the dropdown. The system will calculate modifiers based on Recoil, Cover, and Range.
3.  **Melee:** Enter any **Reserved Dice** you wish to withhold for defense. Enter the target's Defense ratings if known.
4.  Click **Roll**. The result will show:
    * **Success Die** (Black/White).
    * **Skill Dice** (Matches or Hits).
    * **Margin of Success (MOS)** effects (e.g., +Damage or Headshots).

### Drugs & Consumables
1.  Add a Drug item (e.g., *Shatter*) to your inventory.
2.  Click the **Syringe Icon** (<i class="fas fa-syringe"></i>) on the item line.
3.  This consumes 1 dose and prints the drug's Duration and Effects to the chat log for reference.

## ⚖️ License & Credits

This system is an unofficial fan creation.
* **Game System:** Based on *SLA Industries 2nd Edition* by Nightfall Games.
* **Code:** Built on the Foundry VTT Boilerplate system.



