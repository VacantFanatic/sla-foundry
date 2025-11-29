SLA Industries 2nd Edition (Foundry VTT)
A fully automated, fan-made system implementation for playing SLA Industries 2nd Edition on Foundry Virtual Tabletop. This system automates the S5S dice mechanics, combat math, flux management, and movement rules.

🌟 Key Features
🗂️ Character & Threat Sheets
Operative Sheet: Styled to look like a Security Clearance Card. Automatically calculates Ratings Points (2-1-0 rule), Initiative, Encumbrance, and Movement based on Stats.

Threat Sheet: A high-contrast, red-header "Stat Block" design for NPCs and enemies, designed for quick GM reference.

🎲 S5S Dice Engine
Automatically rolls the Success Die (1d10 + Stat + Rank) and Skill Dice (Rank d10).

Calculates margins of success and displays them in a custom Chat Card.

Handles Wound Penalties and Global Modifiers (Prone, Stunned) automatically.

⚔️ Combat Automation
Tactical Attack Dialog: Apply modifiers for Cover, Aiming, Charging, Dual Wielding, and Firing Modes (Burst/Auto/Suppress).

Smart Damage: Auto-calculates damage bonuses based on Strength (Melee), Rate of Fire, and Ammo Type (HE/AP).

One-Click Application: Chat cards feature "Apply Damage" buttons that automatically:

Deduct Armor Points (PV) via Degradation (AD).

Apply remaining damage to Hit Points (HP).

Warn the GM if Massive Damage (>50% HP) occurs.

🔮 The Ebb & Drugs
Ebb Formulas: Tracks Flux usage automatically. Rolls Calculation Tests based on the Linked Discipline's rank.

Combat Drugs: Toggleable "Active" state that applies stat buffs/debuffs and tracks addiction ratings.

📏 Tactical Movement
Includes a Custom Ruler that changes color based on the character's speed:

Green: Closing Speed (Walk)

Yellow: Rushing Speed (Run)

Red: Maximum Range exceeded

📦 Installation
Download the sla-industries.zip file.

Extract the contents into your Foundry Data folder: .../FoundryVTT/Data/systems/sla-industries/.

Restart Foundry VTT.

Create a new World and select SLA Industries 2nd Edition as the Game System.

⚙️ Setup Guide
1. Creating an Operative
Create a new Actor (Type: Operative).

Select a Species from the dropdown in the header. This sets your Min/Max stats and Movement speeds.

Enter your Base Stats (STR, DEX, etc.). Body, Brains, and Bravado will calculate automatically.

Click the Inventory tab (bottom) to add Weapons, Armor, and Gear.

2. Setting up Combat
Armor: Create an Armor item, set the PV and Resistance. Click the Shield Icon in the inventory to Equip it (The icon will turn Green and your Total PV will update).

Weapons: Create a Weapon.

Set the Linked Skill (e.g., Pistol) in the item details.

Ensure you have the corresponding Skill on your character sheet.

Attacking: Click the Weapon Name in your inventory. Select your modifiers in the dialog and click Roll.

Damage: Click the "Roll Damage" button in the chat card.

3. Using Ebb Powers
Create a Discipline item (e.g., "Telekinesis") and set your Rank.

Create an Ebb Formula item (e.g., "Push").

Edit the Formula and link it to the Discipline via the dropdown.

Click the Formula in your inventory to cast. Flux will be deducted automatically.

🛠️ Macros
To quickly populate your world with standard gear and skills, create a Script Macro and paste the following code generators (provided in the system documentation):

Armory Generator: Creates standard Weapons & Armor.

Skill Database: Creates all core Skills.

Drug Lab: Creates standard Combat Drugs.

Ebb Library: Creates standard Disciplines and Formulas.

⚖️ Legal & Credits
Unofficial System: This system is a fan creation and is not endorsed by Nightfall Games. Copyright: SLA Industries is a registered trademark of Nightfall Games. All rights reserved. This system is intended for personal use only.