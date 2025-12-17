SLA Industries 2nd Edition (Foundry VTT)
A fully automated, fan-made system implementation for playing SLA Industries 2nd Edition on Foundry Virtual Tabletop. This system automates the S5S dice mechanics, combat math, flux management, and movement rules.

# 🌟 Key Features
## 🗂️ Character & Threat Sheets
- Operative Sheet: Styled to look like a Security Clearance Card. Automatically calculates Ratings Points (2-1-0 rule), Initiative, Encumbrance, and Movement based on Stats.
- Threat Sheet: A high-contrast, red-header "Stat Block" design for NPCs and enemies, designed for quick GM reference.

## 🎲 S5S Dice Engine
- Automatically rolls the Success Die (1d10 + Stat + Rank) and Skill Dice (Rank d10).
- Calculates margins of success and displays them in a custom Chat Card.
- Handles Wound Penalties and Global Modifiers (Prone, Stunned) automatically.

## ⚔️ Combat Automation
*Tactical Attack Dialog: Apply modifiers for Cover, Aiming, Charging, Dual Wielding, and Firing Modes (Burst/Auto/Suppress).
* Smart Damage: Auto-calculates damage bonuses based on Strength (Melee), Rate of Fire, and Ammo Type (HE/AP).
* One-Click Application: Chat cards feature "Apply Damage" buttons that automatically:
     * Deduct Resistance via Weapon armor damage (AD).
     * Apply remaining damage (DMG-PV) to Hit Points (HP).
     * Warn the GM if Massive Damage (>50% HP) occurs.

## 🔮 The Ebb & Drugs
* Ebb Formulas: Tracks Flux usage automatically. Rolls Calculation Tests based on the Linked Discipline's rank.
* Combat Drugs: Toggleable "Active" state that applies stat buffs/debuffs and tracks addiction ratings.

## 📏 Tactical Movement
* Includes a Custom Ruler that changes color based on the character's speed:
    * Green: Closing Speed (Walk)
    * Yellow: Rushing Speed (Run)
    * Red: Maximum Range exceeded

## 📦 Installation

### Local
* Download the sla-industries.zip file.
* Extract the contents into your Foundry Data folder: .../FoundryVTT/Data/systems/sla-industries/.
* Restart Foundry VTT.
* Create a new World and select SLA Industries 2nd Edition as the Game System.

### Manifest
* https://github.com/VacantFanatic/sla-foundry/releases/latest/download/system.json
  
## ⚙️ Setup Guide
https://github.com/VacantFanatic/sla-foundry/blob/main/item_setup.md

## ⚖️ Legal & Credits
 Unofficial System: This system is a fan creation and is not endorsed by Nightfall Games. Copyright: SLA Industries is a registered trademark of Nightfall Games. All rights reserved. This system is intended for personal use only.


