# SLA Industries: Item Setup & Linking Guide

Welcome to the SLA Industries system for Foundry VTT! This guide explains how to create items and use the **Drag-and-Drop Linking** features to connect Skills, Weapons, Ammo, Ebb powers, and more.

## 1. Creating & Linking Skills

Skills are the foundation of the system. You can link them to Species, Packages, and Weapons.

### A. Creating a Skill

1. Go to the **Items Directory** (right sidebar).
2. Click **Create Item**, name it (e.g., _Pistol_), and select type **Skill**.
3. In the sheet, select the **Related Stat** (e.g., _Dexterity_).
4. **Rank** is usually left at `0` or `1` for the base item; it will be upgraded when added to an Actor.

### B. Granting Skills via Species & Packages

You can create a "Package" (e.g., _Kick Murder Squad_) that automatically gives a list of skills to an operative.

1. Create an Item of type **Species** or **Package**.
2. Open the Item Sheet. You will see a large **"Granted Skills"** drop zone.
3. Drag a **Skill Item** from the sidebar and drop it onto this zone.
4. The skill will appear in the list. You can click the **Rank** number to modify it (e.g., set _Pistol_ to Rank 3).
5. **Usage:** When you drop this Package onto an Actor, all listed skills are automatically added to that Actor at the specified ranks.

### C. Linking a Skill to a Weapon

Weapons need to know which skill they use for attack rolls.

1. Open a **Weapon** item sheet.
2. Locate the **Required Skill** box (dashed outline).
3. Drag a **Skill Item** (e.g., _Pistol_) from the sidebar and drop it into the box.
4. The box will update to show the linked skill name.
5. **Usage:** When you roll an attack with this weapon, the system automatically checks the Actor for that specific skill rank.

---

## 2. Weapons & Ammunition

The system handles ammo tracking by linking specific Magazine items to Weapon items.

### A. Setting up a Weapon

1. Create a **Weapon** item (e.g., _FEN 603_).
2. Set the **Stats**: Damage, Rate of Fire (ROF), and Recoil.
3. **Important:** Link the Required Skill (see section 1C above).

### B. Setting up a Magazine

1. Create a **Magazine** item (e.g., _FEN 603 Mag_).
2. Set the **Capacity** (e.g., `30` rounds).
3. **Link to Weapon:**

- Look for the **"Linked Weapon"** drop zone.
- Drag your _FEN 603_ Weapon item onto this box.
- The Magazine now knows it belongs to the _FEN 603_.

### C. Reloading in Combat

1. Give an Actor both the **Weapon** and several **Magazines**.
2. On the Actor Sheet **Combat Tab**, click the **Reload** (Cycle) icon next to the gun.
3. The system will search the inventory for any Magazine linked to that gun.

- If one type is found, it reloads instantly.
- If multiple types are found (e.g., _Standard Mag_ vs _Hollow Point_), a dialog asks you which one to load.

4. The Magazine is consumed (Quantity -1) and the Weapon's ammo count is refilled.

---

## 3. Ebb & Disciplines

Ebb users (Ebonites) rely on Formulas which are governed by Disciplines. The **Ebb** tab is only visible on operative sheets where the actor's **Species** name contains "ebonite". Non-Ebonite actors see a **Combat** tab with wounds and loadout only.

### A. Creating a Discipline

1. Create an Item of type **Discipline** (e.g., _Reality Folding_).
2. Set the **Rank** (this acts as the base modifier for rolls).

### B. Creating a Formula

1. Create an Item of type **Ebb Formula** (e.g., _Fold_).
2. Set the **Formula Rating** (Target Number), **Flux Cost**, and **Effect**:
    - **Effect:** `damage` / `heal` / `effect` — controls MOS bonus rules and chat card behavior.
    - **Target:** `self` / `ally` / `enemy` — affects how the result is applied. Self-target formulas apply directly to the caster.
    - **Wounds to Remove:** 0–6 wound locations to clear on a successful roll.
    - **Attack Shape** (damage formulas): `Ranged` (default) shows Damage / Min Damage / AD / Range
      / ROF / Recoil, for weapon-style Formulas. `Blast / Area` shows Damage / Min Damage / AD /
      Kill Zone / Max Blast instead, for grenade-style AoE Formulas — matching the sourcebook's two
      different stat-block layouts for Blast/Telekinesis/Thermal Formulas.
3. **Link the Discipline:**

- Locate the **"Required Discipline"** drop zone (purple dashed box).
- Drag the _Reality Folding_ Discipline item onto it.

4. **Usage:** When you roll this Formula, the system looks up the Actor's _Reality Folding_ rank to calculate the dice pool (`1d10 + (Rank+1)d10`) and spends the configured **Flux Cost**.

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

| Type         | Tab                       | Notes                               |
| ------------ | ------------------------- | ----------------------------------- |
| `weapon`     | Combat / Inventory        | Attack rolls, ammo tracking         |
| `armor`      | Combat / Inventory        | PV and Resistance                   |
| `explosive`  | Combat / Inventory        | Throw automation, quantity tracking |
| `magazine`   | Inventory                 | Links to a weapon; reloading        |
| `drug`       | Inventory                 | Consume action; Active Effects      |
| `item`       | Inventory                 | Generic gear                        |
| `toxicant`   | Bio & Traits → Infections | Infection test action               |
| `skill`      | Skills tab                | Sorted by stat                      |
| `trait`      | Bio & Traits              | Reference                           |
| `discipline` | Ebb tab (Ebonites only)   | Nested with formulas                |
| `ebbFormula` | Ebb tab (Ebonites only)   | Rolls, flux, wounds                 |

### Stackable Items

Dragging **gear**, **explosives**, **magazines**, or **drugs** onto an actor sheet **merges** into an existing stack when the system considers it the same item:

- Items with a compendium source ID match by that ID.
- Other items match by type + name (case-insensitive), and magazines also require matching `ammoType` and `ammoCapacity`.
- Items with embedded Active Effects are **never** merged automatically.

### Active Effects — which item types apply them, and when

Only some item types have an **Effects** tab, and only for those types does putting a Change
row there actually do anything — every one of them has a real, specific trigger that copies the
item's embedded effects onto the actor:

| Type                                                             | Effects tab? | Applies to the actor...                                       |
| ---------------------------------------------------------------- | ------------ | ------------------------------------------------------------- |
| `item`                                                           | Yes          | While **Equipped** (toggle on the sheet)                      |
| `trait`                                                          | Yes          | While the actor **owns** the trait (grant/revoke — see below) |
| `drug`                                                           | Yes          | While **Active** (Consume/toggle)                             |
| `toxicant`                                                       | Yes          | On a **failed** infection test (§5)                           |
| `ebbFormula`                                                     | Yes          | Via the post-roll chat button (§3C)                           |
| `weapon`, `armor`, `explosive`, `magazine`, `species`, `package` | No           | —                                                             |

The second group has no Effects tab at all — nothing in the system ever reads an embedded effect
on those types, so the tab was removed rather than leaving a control on the sheet that silently
does nothing (issue #363). Powered armor's stat bonuses are still fully supported — see §7B/C,
which use dedicated Mods/DEX Cap/Init Bonus fields instead of Active Effects.

**Gear (`item`) and Traits (`trait`)** are the two types most likely to need a plain stat bonus
(a bought perk, a piece of flavor gear like a gang-colors bonus, a character-creation trait like
Natural Aptitude): add a Change on `system.stats.<stat>.bonus` (type Add) or
`system.rollModifier.bonus` on the item's Effects tab. For gear, the bonus is live exactly while
the item's **Equipped** checkbox is on. For a trait, the bonus is live exactly while the actor
owns that trait item — granted the moment it's added to the actor (drag-drop, the sidebar
**Create Item** button, or a compendium import all work), removed the moment it's deleted from
the actor. Traits with a conditional or GM-adjudicated effect (a phobia only triggering near its
stimulus, an illness only causing a penalty during a flare-up) are still resolved manually at the
table — only attach an Active Effect to a trait whose rule is a flat, always-on modifier.

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

### D. Shields

1. Create an **Armor** item and check **Is Shield**.
2. Set **PV (Melee)** and **PV (Ranged)** — for a flat shield like the PP949 Breacher, set both to
   the same value (e.g. `2`/`2`); for an asymmetric one like the Ebb Advanced Shield, set them
   independently (e.g. `2`/`4`). These stack additively on top of the wearer's body armor PV,
   automatically applied based on whether the attacking weapon is Melee or Ranged.
3. Set the shield's own **Resistance** (current/max) — separate from the wearer's body armor
   resistance. When the shield is actively blocking a hit (see step 5), **all** of that hit's
   Armor Damage (AD) is inflicted against the shield's Resistance only — the wearer's body armor
   Resistance is untouched for that hit.
4. Equip the shield once, like any other worn item — this just means "the character is
   carrying/raising it," and does not by itself block anything.
5. **Each time the shield's wearer is hit**, narrate a Shield Craft skill roll against a GM-set
   target number (using the normal skill roll UI — Shield Craft is already a skill on the
   character). If it succeeds, check **"Shield Craft Succeeded"** on the Apply Damage chat card
   before clicking Apply. If it fails, leave the checkbox unchecked — the hit bypasses the shield
   and only the wearer's body armor applies.
6. The generic **PV** field on a shield item is unused — leave it at `0`.
7. Not automated (GM calls these narratively): a shield can't block an attack from behind the
   wearer, and some shields require a minimum STR to use.
8. Example: PP949 Breacher Shield — PV Melee `2`, PV Ranged `2`, Resistance `12`/`12`.
9. **If the shield's rulebook entry also lets it be used as a melee weapon** (e.g. the PP949
   Breacher Shield, usable as a weapon by a wielder with STR 3+), don't add anything to the shield
   item itself — create a separate, ordinary **Weapon** item for it instead (e.g. named
   `"Breacher Shield (Melee)"`), using the normal weapon item creation flow: set its Damage, Min
   Damage, and AD from the shield's rulebook weapon profile (e.g. `1d10-3`, Min Damage `2`, AD
   `0`), and drag the Shield Craft skill item onto its skill-link box, exactly like setting up any
   other weapon. This gives the shield-as-weapon a fully working attack roll (Attack Dialog,
   damage button, combat loadout listing) for free, since it's a real weapon item — no new fields
   or UI are needed on the Armor item, which continues to only carry the PV/Resistance defense
   mechanic.

---

## 8. Explosives

Explosives are thrown weapons with an inner and outer blast radius. The system partially automates area measurement and effect regions.

### Setting up an Explosive

1. Create an item of type **Explosive** (e.g., _Fragmentation Grenade_).
2. Set the fields:
    - **Damage** and **Min Damage:** Roll formula (e.g. `3d10`) and floor.
    - **AD:** Armour Damage value applied on each hit.
    - **Blast Radius Inner:** Distance in grid units for the primary zone (full effect).
    - **Blast Radius Outer:** Distance in grid units for the secondary zone.
    - **Skill:** The skill used for the throw roll (default: `Throw`).
3. Link the relevant throwing skill to the actor (the _Throw_ skill uses STR as its governing stat).

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
2. Choose type **Vehicle** and name it (e.g., _Manta APC_).
3. The vehicle sheet opens with the following fields:

| Field                            | Description                                                       |
| -------------------------------- | ----------------------------------------------------------------- |
| HP (current / max)               | Vehicle structural integrity                                      |
| PV                               | Protection Value against each hit                                 |
| Resist (current / max)           | Powered armor-style resistance bar (token bar)                    |
| Move                             | Speed in grid units; used for the token ruler                     |
| Drive Skill                      | The skill name used for driving checks (text reference only)      |
| Dimensions                       | Length / Width / Height (text, for reference)                     |
| Capacity                         | Crew and passenger count (text, for reference)                    |
| Provides Cover                   | Whether occupants benefit from cover                              |
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
