# SLA Industries: Item Setup & Linking Guide

Welcome to the SLA Industries system for Foundry VTT! This guide explains how to create items and use the **Drag-and-Drop Linking** features to connect Skills, Weapons, Ammo, Ebb powers, and more.

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

Ebb users (Ebonites) rely on Formulas which are governed by Disciplines. The **Ebb** tab is only visible on operative sheets where the actor's **Species** name contains "ebonite". Non-Ebonite actors see a **Combat** tab with wounds and loadout only.

### A. Creating a Discipline

1. Create an Item of type **Discipline** (e.g., *Reality Folding*).
2. Set the **Rank** (this acts as the base modifier for rolls).

### B. Creating a Formula

1. Create an Item of type **Ebb Formula** (e.g., *Fold*).
2. Set the **Formula Rating** (Target Number), **Flux Cost**, and **Effect**:
   - **Effect:** `damage` / `heal` / `effect` — controls MOS bonus rules and chat card behavior.
   - **Target:** `self` / `ally` / `enemy` — affects how the result is applied. Self-target formulas apply directly to the caster.
   - **Wounds to Remove:** 0–6 wound locations to clear on a successful roll.
3. **Link the Discipline:**
* Locate the **"Required Discipline"** drop zone (purple dashed box).
* Drag the *Reality Folding* Discipline item onto it.


4. **Usage:** When you roll this Formula, the system looks up the Actor's *Reality Folding* rank to calculate the dice pool (`1d10 + (Rank+1)d10`) and spends the configured **Flux Cost**.

### C. Ebb Formula Effects

After a successful roll, the chat card shows action buttons (GM-only for apply controls):

- **Damage formulas:** Apply damage to the targeted token; MOS grants +1/+2/+4 damage at 2/3/4 skill successes.
- **Heal formulas:** Apply healing to the targeted or selected token. When **Wounds to Remove** > 0, you can set the formula to **Heal and wounds** (both on one apply) or **Heal or wounds** (separate actions, each disables the other once used).
- **Wounds-only formulas:** Effect = `effect` with Wounds to Remove > 0 shows a **Remove wounds** button.
- **Embedded Active Effects:** The formula item supports an **Effects** tab. On a successful roll, GM buttons appear to apply those effects to the target/selected token.

### D. Ebb Critical (MOS 4+)

On a successful Ebb roll where the caster gets **4 or more skill dice successes**, the caster **regains 1 FLUX** (capped at max). This is tracked on the chat message — if the GM adjusts the TN or Luck alters the roll outcome, the flux recovery is recalculated automatically.

---

## 4. Drugs

Drugs are consumed via the **Consume** button in the Inventory tab. Quantity decreases by 1 and an effect card is posted to chat.

Drug stat modifiers and damage reduction **must be configured as embedded Active Effects** on the drug item (the old `Mod 1`/`Mod 2` fields are removed). When the drug is toggled active or consumed as a syringe, those effects transfer to the actor. When the drug wears off, the effects are removed.

Fields on the drug item sheet:
- **Addiction Rating / Addiction Dose:** Reference text; addiction tests are resolved manually at the table.
- **Duration:** Reference text for how long the drug lasts.
- **Detox Effects:** Reference text for treatment information.

---

## 5. Toxicants (Infections)

Toxicants appear under the **Bio & Traits → Infections** section on operative sheets.

1. Create an item of type **Toxicant**.
2. Set the fields:
   - **Infection Rating:** The TN for the infection test (Success Die + STR).
   - **Vector / Progression / Treatment / Treatment Rating:** Reference text for the GM.
3. Embedded **Active Effects** on the toxicant are transferred to the actor on a **failed** infection test.
4. On a **successful** test, the actor becomes **immune for the current encounter** (tracked by combat id while in combat, or scene id otherwise). Immunity clears automatically when the encounter or scene changes.

**Note:** The system rolls the infection test automatically when the actor uses the infection action, but treatment rolls are resolved manually.

---

## 6. Inventory Organization

The Actor Sheet automatically sorts items into the following categories based on their **Item Type**. You do not need to do anything manually; just create the item with the correct type.

| Type | Tab | Notes |
|---|---|---|
| `weapon` | Combat / Inventory | Attack rolls, ammo tracking |
| `armor` | Combat / Inventory | PV and Resistance |
| `explosive` | Combat / Inventory | Throw automation, quantity tracking |
| `magazine` | Inventory | Links to a weapon; reloading |
| `drug` | Inventory | Consume action; Active Effects |
| `item` | Inventory | Generic gear |
| `toxicant` | Bio & Traits → Infections | Infection test action |
| `skill` | Skills tab | Sorted by stat |
| `trait` | Bio & Traits | Reference |
| `discipline` | Ebb tab (Ebonites only) | Nested with formulas |
| `ebbFormula` | Ebb tab (Ebonites only) | Rolls, flux, wounds |

### Stackable Items

Dragging **gear**, **explosives**, **magazines**, or **drugs** onto an actor sheet **merges** into an existing stack when the system considers it the same item:
- Items with a compendium source ID match by that ID.
- Other items match by type + name (case-insensitive), and magazines also require matching `ammoType` and `ammoCapacity`.
- Items with embedded Active Effects are **never** merged automatically.

---

## 7. Armor & Powersuits

### A. Standard Armor

1. Create an **Armor** item.
2. Set **PV** (Protection Value) and **Resistance** (current/max).
3. Mark **Equipped** on the actor sheet to activate PV for combat.
4. Leave **Powered** unchecked for standard armor. The item weight counts towards encumbrance.

### B. Powered Armor (non-powersuit)

Powered armor provides stat bonuses while retaining a resistance bar.

1. Create an **Armor** item and check **Powered**.
2. Set **Resistance** (current/max) — this becomes the second token bar (`armor.resist`).
3. Fill the **Mods** section:
   - **STR Mod / DEX Mod:** Flat additions to the actor's derived STR and DEX totals.
   - **Move Closing / Move Rushing:** Added to the actor's base movement from their species.
4. If the armor's resistance drops to **0**, its PV becomes 0 and its weight counts as **6** for encumbrance regardless of its listed weight.

### C. Powersuit

A powersuit **replaces** the actor's STR total and caps DEX, rather than adding to them.

1. Create an **Armor** item, check **Powered**, and also check **Powersuit**.
2. Set **Resistance** and **PV** as above.
3. Fill the **Mods** section:
   - **STR Mod:** The value written here **becomes** the actor's STR total (not additive). Set it to the powersuit's rated strength.
   - **DEX Mod:** Added to DEX total after the replacement (still additive for DEX).
   - **DEX Cap:** If set (> 0), the actor's DEX total cannot exceed this value.
   - **Init Bonus:** Added to the initiative calculation.
   - **Move Closing / Move Rushing:** Added to base movement.
4. If the actor wears multiple powersuit items, only the one with the highest resistance value is treated as the active powersuit.
5. Drag `system.powersuitAttack = true` weapons to the actor to mark them as requiring powersuit use.

> **Tip:** To configure the powersuit STR replacement, set `mods.str` to the powersuit's strength rating (e.g. `12`). This overwrites the biological STR entirely while the suit is equipped.

---

## 8. Explosives

Explosives are thrown weapons with an inner and outer blast radius. The system partially automates area measurement and effect regions.

### Setting up an Explosive

1. Create an item of type **Explosive** (e.g., *Fragmentation Grenade*).
2. Set the fields:
   - **Damage** and **Min Damage:** Roll formula (e.g. `3d10`) and floor.
   - **AD:** Armour Damage value applied on each hit.
   - **Blast Radius Inner:** Distance in grid units for the primary zone (full effect).
   - **Blast Radius Outer:** Distance in grid units for the secondary zone.
   - **Skill:** The skill used for the throw roll (default: `Throw`).
3. Link the relevant throwing skill to the actor (the *Throw* skill uses STR as its governing stat).

### Throwing an Explosive

1. On the Combat tab, click the roll icon next to the explosive.
2. The system posts a throw roll card using the actor's linked throw skill.
3. If the **Explosive Automation** world setting is enabled, a Foundry measured template (circle) is placed on the canvas at the target location.
4. If **Explosive Blast Region Visibility** is enabled, the blast region is visible to players; otherwise it is GM-only until resolved.

### Inventory tracking

Explosives use the `quantity` field. One unit is consumed per throw. Stack merging applies the same rules as other consumables (see Section 6).

---

## 9. Vehicle Actors

Vehicles are a distinct actor type with their own sheet. They track HP, armor, move speed, and carry mounted weapons.

### Creating a Vehicle

1. Go to the **Actors Directory** and click **Create Actor**.
2. Choose type **Vehicle** and name it (e.g., *Manta APC*).
3. The vehicle sheet opens with the following fields:

| Field | Description |
|---|---|
| HP (current / max) | Vehicle structural integrity |
| PV | Protection Value against each hit |
| Resist (current / max) | Powered armor-style resistance bar (token bar) |
| Move | Speed in grid units; used for the token ruler |
| Drive Skill | The skill name used for driving checks (text reference only) |
| Dimensions | Length / Width / Height (text, for reference) |
| Capacity | Crew and passenger count (text, for reference) |
| Provides Cover | Whether occupants benefit from cover |
| Mounted Weapons Ignore Skill Req | Operators may use mounted weapons without owning the linked skill |

### Adding Mounted Weapons

Drag any **Weapon** item onto the vehicle sheet's **WEAPONS** drop zone. Weapon attack rolls from the vehicle sheet use the vehicle as the roll source. If **Mounted Weapons Ignore Skill Req** is checked, missing skill items do not block the roll.

### Vehicle movement ruler

On the canvas, the movement ruler for a vehicle turns **green** within the Move value and **red** beyond it. If the **Combat Movement Lock** setting is active and the vehicle's movement action is spent, the ruler is entirely red.

### Compendium

A starter set of vehicle actors is available in the **Vehicles** compendium pack (`sla-industries.vehicles`). Drag entries from there to the Actors Directory as a starting point, then adjust stats as needed.

---

## 10. Quick Troubleshooting

- **"Skill Not Found" during Attack:** Ensure the Weapon has a skill linked in the "Required Skill" box, and that the Actor actually possesses that skill.
- **Reload Button Missing:** The reload button only appears for **ranged** weapons. Ensure the weapon's `Required Skill` is not `melee` or `unarmed`, and that `Max Ammo` is greater than 0.
- **Ebb Tab Missing:** The Ebb tab only appears if the Actor's **Species** item name contains "ebonite" (case-insensitive).
- **Drug effects not applying:** Drug stat changes must be modeled as **embedded Active Effects** on the drug item, not in text fields.
- **Toxicant immunity not clearing:** Immunity scope changes when combat ends or the active scene changes. Start a new combat or navigate to a different scene to reset.
- **Wound apply button hidden:** If the target is an **NPC** and the world setting **Enable NPC Wound Tracking** is off, the wound button is hidden on chat cards (the +Damage option remains available).
