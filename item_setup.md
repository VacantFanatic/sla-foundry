# SLA Industries: Item Setup & Linking Guide

Welcome to the SLA Industries system for Foundry VTT! This guide explains how to create items and use the **Drag-and-Drop Linking** features to connect Skills, Weapons, Ammo, and Ebb powers.

## 1. Creating & Linking Skills

Skills are the foundation of the system. You can link them to Species, Packages, and Weapons.

### A. Creating a Skill

1. Go to the **Items Directory** (right sidebar).
2. Click **Create Item**, name it (e.g., *Pistol*), and select type **Skill**.
3. In the sheet, select the **Related Stat** (e.g., *Dexterity*).
4. **Rank** is usually left at `0` or `1` for the base item; it will be upgraded when added to an Actor.

### B. Granting Skills via Species & Packages

You can create a "Package" (e.g., *Kick Murder Squad*) that automatically gives a list of skills to an operative.

1. Create an Item of type **Species** or **Package**.
2. Open the Item Sheet. You will see a large **"Granted Skills"** drop zone.
3. Drag a **Skill Item** from the sidebar and drop it onto this zone.
4. The skill will appear in the list. You can click the **Rank** number to modify it (e.g., set *Pistol* to Rank 3).
5. **Usage:** When you drop this Package onto an Actor, all listed skills are automatically added to that Actor at the specified ranks.

### C. Linking a Skill to a Weapon

Weapons need to know which skill they use for attack rolls.

1. Open a **Weapon** item sheet.
2. Locate the **Required Skill** box (dashed outline).
3. Drag a **Skill Item** (e.g., *Pistol*) from the sidebar and drop it into the box.
4. The box will update to show the linked skill name.
5. **Usage:** When you roll an attack with this weapon, the system automatically checks the Actor for that specific skill rank.

---

## 2. Weapons & Ammunition

The system handles ammo tracking by linking specific Magazine items to Weapon items.

### A. Setting up a Weapon

1. Create a **Weapon** item (e.g., *FEN 603*).
2. Set the **Stats**: Damage, Rate of Fire (ROF), and Recoil.
3. **Important:** Link the Required Skill (see section 1C above).

### B. Setting up a Magazine

1. Create a **Magazine** item (e.g., *FEN 603 Mag*).
2. Set the **Capacity** (e.g., `30` rounds).
3. **Link to Weapon:**
* Look for the **"Linked Weapon"** drop zone.
* Drag your *FEN 603* Weapon item onto this box.
* The Magazine now knows it belongs to the *FEN 603*.



### C. Reloading in Combat

1. Give an Actor both the **Weapon** and several **Magazines**.
2. On the Actor Sheet **Combat Tab**, click the **Reload** (Cycle) icon next to the gun.
3. The system will search the inventory for any Magazine linked to that gun.
* If one type is found, it reloads instantly.
* If multiple types are found (e.g., *Standard Mag* vs *Hollow Point*), a dialog asks you which one to load.


4. The Magazine is consumed (Quantity -1) and the Weapon's ammo count is refilled.

---

## 3. Ebb & Disciplines

Ebb users (Ebonites) rely on Formulas which are governed by Disciplines.

### A. Creating a Discipline

1. Create an Item of type **Discipline** (e.g., *Reality Folding*).
2. Set the **Rank** (this acts as the base modifier for rolls).

### B. Creating a Formula

1. Create an Item of type **Ebb Formula** (e.g., *Fold*).
2. Set the **Formula Rating** (Target Number) and **Flux Cost**.
3. **Link the Discipline:**
* Locate the **"Required Discipline"** drop zone (purple dashed box).
* Drag the *Reality Folding* Discipline item onto it.


4. **Usage:** When you roll this Formula, the system looks up the Actor's *Reality Folding* rank to calculate the dice pool (`1d10 + (Rank+1)d10`).

---

## 4. Inventory Organization

The Actor Sheet automatically sorts items into the following categories based on their **Item Type**. You do not need to do anything manually; just create the item with the correct type.

* **Weapons:** Type `weapon`.
* **Armor:** Type `armor` (Tracks PV and Resistance).
* **Ammunition:** Type `magazine` (Tracks Quantity and Capacity).
* **Drugs:** Type `drug` (Tracks Addiction and Stat Mods).
* **Gear:** Type `item` (General equipment).

---

### Quick Troubleshooting

* **"Skill Not Found" during Attack:** Ensure the Weapon has a skill linked in the "Required Skill" box, and that the Actor actually possesses that skill.
* **Reload Button Missing:** The reload button only appears if the Weapon has a `Max Ammo` value greater than 0. Use the reload function once to initialize it, or manually set Max Ammo in the item sheet.
* **Ebb Section Missing:** The "Combat" tab only shows Ebb powers if the Actor's **Species** item contains the word "Ebonite" (or "Necanthrop").
