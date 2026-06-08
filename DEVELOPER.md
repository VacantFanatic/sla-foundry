# SLA Industries: Developer Guide

This document covers the system's architecture, public API, migration system, and patterns for contributors.

---

## Project Structure

```
sla-industries/
├── module/
│   ├── sla-industries.mjs      # Entry point: init hook, settings registration, global hooks
│   ├── config.mjs              # SLA config object (stats, skills, disciplines, ammo types, etc.)
│   ├── migration.mjs           # World data migration (versioned upgrade steps)
│   ├── apps/
│   │   ├── luck-dialog.mjs     # Luck reroll dialog (ApplicationV2)
│   │   ├── xp-dialog.mjs       # XP spend dialog (ApplicationV2)
│   │   └── sla-simple-dialog.mjs  # Reusable modal dialog (replaces legacy Dialog)
│   ├── canvas/
│   │   └── sla-ruler.mjs       # Custom TokenRuler: color-coded movement ranges
│   ├── data/
│   │   ├── actor.mjs           # TypeDataModel subclasses for character, npc, vehicle
│   │   ├── item.mjs            # TypeDataModel subclasses for all item types
│   │   └── natural-weapons.mjs # Punch/Kick baseline definitions
│   ├── documents/
│   │   ├── actor.mjs           # BoilerplateActor — derived data, active effects, HP sync
│   │   └── item.mjs            # BoilerplateItem
│   ├── helpers/
│   │   ├── chat.mjs            # SLAChat — all chat card rendering and button handlers
│   │   ├── dice.mjs            # Roll helpers: calculateRollResult, getMOS, createSLARoll
│   │   ├── drop-handlers.mjs   # Item drop linking (weapon→magazine, skill→weapon, etc.)
│   │   ├── ebb-flux.mjs        # Critical Ebb flux regain/revoke
│   │   ├── ebb-mos.mjs         # Ebb MOS damage bonus (pure function)
│   │   ├── inventory-stack.mjs # Stackable item drop merge and migration consolidation
│   │   ├── item-sheet.mjs      # Item sheet helpers
│   │   ├── items.mjs           # prepareItems(), normalizeEbbEffect(), normalizeEbbHealWoundMode()
│   │   ├── modifiers.mjs       # Stat modifier helpers
│   │   ├── sla-hotbar.mjs      # Hotbar macro creation and rollOwnedItem()
│   │   ├── templates.mjs       # Handlebars template preload list
│   │   ├── toxicant-scope.mjs  # Toxicant immunity scope tracking (combat/scene flags)
│   │   └── wound-visibility.mjs  # shouldShowMosWoundChoice()
│   └── sheets/
│       ├── actor/
│       │   ├── roll-math.mjs   # Pure skill/weapon roll math (unit tested)
│       │   └── skill-rolls.mjs # Skill roll execution extracted from actor sheet
│       ├── actor-sheet.mjs     # SlaActorSheet (operative/character, ApplicationV2)
│       ├── actor-npc-sheet.mjs # SlaNPCSheet (threat/NPC, ApplicationV2)
│       ├── actor-vehicle-sheet.mjs  # SlaVehicleSheet (vehicle, ApplicationV2)
│       └── item-sheet.mjs      # SlaItemSheet (all item types, ApplicationV2)
├── templates/                  # Handlebars templates for sheets and chat cards
├── packs/                      # Compendium source files (.db)
├── scripts/                    # External migration helpers
├── tests/
│   ├── unit/                   # Node.js unit tests (no Foundry dependency)
│   └── e2e/                    # Playwright browser tests (require running Foundry instance)
└── src/scss/                   # SCSS source for CSS compilation
```

---

## Tech Stack

- **Foundry VTT v14** (minimum 14, verified 14.360)
- **Application V2** (`ApplicationV2` + `HandlebarsApplicationMixin`) for all sheets and dialogs.
- **TypeDataModel** (`foundry.abstract.TypeDataModel`) for all actor and item data schemas.
- **SCSS** compiled to `css/sla-industries.css` via `npm run build:css` (or `npm run watch`). `npm run build` also assembles **`dist/`** (Foundry-installable runtime files). `npm run package` produces `sla-industries.zip` for releases.
- **Node.js test runner** for unit tests; **Playwright** for end-to-end tests.

---

## Data Models

All schema definitions live in `module/data/actor.mjs` and `module/data/item.mjs`.

### Actor types

| Type | Data class | Notes |
|---|---|---|
| `character` | `SlaCharacterData` | Operative; has biography, appearance, stats, xpLedger |
| `npc` | `SlaNPCData` | Threat; similar to character but with NPC-specific fields |
| `vehicle` | `SlaVehicleData` | Vehicle actor; HP, armor, move, mounted weapons |

### Item types

| Type | Data class | Key fields |
|---|---|---|
| `weapon` | `SlaWeaponData` | damage, firingModes, attackType, skill, powersuitAttack |
| `armor` | `SlaArmorData` | pv, resistance, powered, powersuit, dexCap, initBonus, mods |
| `explosive` | `SlaExplosiveData` | damage, blastRadiusInner, blastRadiusOuter, skill |
| `magazine` | `SlaMagazineData` | ammoType, ammoCapacity, linkedWeapon |
| `skill` | `SlaSkillData` | rank, stat |
| `trait` | `SlaTraitData` | rank, type |
| `ebbFormula` | `SlaEbbFormulaData` | cost, formulaRating, ebbEffect, ebbTarget, removeWounds, ebbHealWoundMode |
| `discipline` | `SlaDisciplineData` | rank, cost |
| `drug` | `SlaDrugData` | active, addiction, quantity; no built-in stat mods — use Active Effects |
| `toxicant` | `SlaToxicantData` | infectionRating, vector, progression, treatment, treatmentRating |
| `species` | `SlaSpeciesData` | hp, luck, flux, move, stats (min/max per stat), skills |
| `package` | `SlaPackageData` | requirements (stat min values), skills |
| `item` (gear) | `SlaItemData` | weight, price, quantity, equipped |

### Active Effects and stats

Core stats (`str`, `dex`, `know`, `conc`, `cha`, `cool`) each have a `value` (sheet base) and a `bonus` field. Active Effects should target `system.stats.<key>.bonus` using mode `Add` to apply temporary modifiers without overwriting the base. The actor's derived data sums all `Add` effect rows for each stat in `prepareDerivedData`.

---

## Derived Data (`BoilerplateActor.prepareDerivedData`)

`module/documents/actor.mjs` handles all derived calculations, including:

- Core stat totals (base `_source` value + stored bonus + live Active Effect `Add` rows).
- HP max from species base + STR total.
- Critical condition (HP < half max HP).
- Wound-based condition cascades (bleeding, stunned, immobile, dead).
- Powersuit STR/DEX/movement overrides when armor with `system.powered = true` is equipped.

---

## Roll System

### Core dice formula

```
1d10 (Success Die) + Xd10 (Skill Dice)
```

The Success Die is always a black d10 (styled for Dice So Nice via `options.appearance`). Both dice pools are evaluated against the **Target Number (TN)**, default 10.

### `calculateRollResult(roll, baseModifier, tn, options)`

Source: `module/helpers/dice.mjs`

Takes an evaluated `Roll` object and returns:
```js
{
  isSuccess,           // boolean
  total,               // Success Die total (sdRaw + modifier + luck + successDieMod)
  sdRaw,               // Raw Success Die result
  skillHits,           // Number of skill dice ≥ TN (+ autoSkillSuccesses)
  skillDiceData,       // Array of { raw, total, borderColor, textColor }
  successThroughExperience  // boolean: failed SD but 4+ skill hits
}
```

### `getMOS(result)`

Converts `calculateRollResult` output into tactical choices:
```js
{
  effect,       // Display text (e.g. "MOS 2: Choose Effect")
  damageBonus,  // Flat bonus added to the damage roll
  hasChoice,    // boolean: player chooses wound vs damage
  choiceType,   // "arm" | "leg" | ""
  choiceDmg     // Damage value for the choice path
}
```

---

## `game.sla` Public API

Registered on the `game` object during `init`. Available to macros and module integrations.

### `game.sla.rollOwnedItem(itemUuid)`

Executes the same action as clicking the roll icon on an actor sheet for that item. Accepts a full UUID string (e.g. `Actor.xxx.Item.yyy`).

Behavior by item type:
| Type | Action |
|---|---|
| `weapon` | Opens the weapon attack dialog |
| `explosive` | Opens the explosive throw dialog |
| `ebbFormula` | Rolls the formula and spends flux |
| `drug` | Consumes one dose |
| `skill` | Executes the skill roll flow |
| Any other | Opens the item sheet |

### `game.sla.addActorItemToHotbar(item)`

Creates or reuses a script macro for the given embedded item and assigns it to the first free hotbar slot.

### `game.sla.canTokenMoveThisTurn(tokenLike)`

Returns `true` if the token is allowed to move this turn (respects the **Enable Combat Movement Lock** setting and per-turn movement state).

Source: `module/helpers/sla-hotbar.mjs`, `module/sla-industries.mjs`

---

## Hotbar Macros

Dragging an embedded actor item onto the macro hotbar automatically creates a script macro that calls `game.sla.rollOwnedItem(uuid)`. Right-clicking any item row on a sheet and choosing **Add to hotbar** does the same.

Macro deduplication: the system stores `flags["sla-industries"].itemMacroUuid` on the macro. If a macro already exists for that item UUID, it is reused rather than duplicated.

---

## Migration System

Source: `module/migration.mjs`

`CURRENT_MIGRATION_VERSION` is the target version. On the `ready` hook, the system compares it to the `systemMigrationVersion` world setting. If the world is older, `migrateWorld()` runs.

### Migration steps (in order)

1. `migrateTo200` — normalize missing HTML fields to `""` on actors/items (required for ProseMirror / ApplicationV2 sheets).
2. `migrateTo210` — strip legacy drug `system.mods` and `system.damageReduction` keys.
3. **Per-document loop:**
   - World items: weapon attackType/firingModes, armor powered fields, species stats, ebbFormula schema changes.
   - Actor embedded items: same per type.
   - Actor data: armor resist schema, xpLedger init, NPC wound/condition fields, vehicle fields, luck/flux max init.
4. External script: `migrateNaturalWeapons` (deduplicates Punch/Kick embedded items).
5. Updates `systemMigrationVersion` setting so the migration does not run again.

### Adding a new migration step

1. Increment `CURRENT_MIGRATION_VERSION` (semver).
2. Write a named async function `migrateTo<Version>()` with clear console logging.
3. Add a call to it inside `migrateWorld()`, before the per-document loop if it is structural, or inside the loop if it targets individual documents.
4. Update the JSDoc comment block at the top of `migration.mjs`.

---

## Hooks Used

| Hook | Where | Purpose |
|---|---|---|
| `init` | `sla-industries.mjs` | Register data models, sheets, settings, Handlebars helpers |
| `ready` | `sla-industries.mjs` | Run migration, init chat listeners, register hotbar hook |
| `updateCombat` | `sla-industries.mjs` | Reset per-turn movement state on turn/round change |
| `deleteCombat` | `sla-industries.mjs` | Prune movement state map for the deleted combat |
| `preUpdateToken` | `sla-industries.mjs` | Block movement if lock is active and action is used |
| `updateToken` | `sla-industries.mjs` | Mark movement used, or undo if options flag is set |
| `updateCombatant` | `sla-industries.mjs` | Clamp stunned combatant initiative to current minimum |
| `hotbarDrop` | `sla-hotbar.mjs` | Create macros from embedded actor item drops |
| `renderChatMessage` | `chat.mjs` | Apply heal/wound mutual-exclusion lock state to re-rendered cards |
| `renderChatMessageHTML` | `sla-industries.mjs` | Delegate to `SLAChat.onRenderChatMessage` |

---

## Running Tests

### Unit tests (no Foundry required)

```bash
npm run test:unit
```

Covers:
- `inventory-stack.mjs` — stackKey identity, merge logic, consolidation.
- `dice.mjs` — `calculateRollResult`, `getMOS`.
- `ebb-mos.mjs` — `getEbbMosDamageBonus`.
- `wound-visibility.mjs` — `shouldShowMosWoundChoice`.
- `system.json` — validates version, manifest URL, compatibility fields.

### End-to-end tests (requires running Foundry instance)

```bash
npm run test:e2e:regression   # SLA API and settings smoke tests
npm run test:e2e:operators    # Operative CRUD, weapon items, roll integration
```

E2E tests require:
- A running Foundry VTT instance accessible at the configured URL.
- `FOUNDRY_USER` environment variable set to the username.
- GM-only steps skip automatically if the user is not a Gamemaster.

### SCSS compilation

```bash
npm run build:css   # SCSS → css/ (local Foundry dev)
npm run build       # css + dist/ (release tree)
npm run package     # dist/ → sla-industries.zip
npm run validate:dist    # assert dist/ matches system.json
npm run validate:package # also validate zip layout
npm run watch       # live SCSS recompile
```

### GitHub release

Pushes to `main` run CI only (version sync, unit tests, dist validation). To publish a release:

1. Bump `version` in `package.json` and `system.json`, update `CHANGELOG.md`, and set the `download` URL in `system.json` to the new tag.
2. Merge to `main`.
3. Create and push a git tag matching the version (no `v` prefix required; both `2.6.5` and `v2.6.5` are accepted):

```bash
git tag 2.6.5
git push origin 2.6.5
```

The **Release** workflow builds `sla-industries.zip`, validates it, and creates draft GitHub releases for the version tag and `latest`. Publish the draft release when ready; the **Foundry Website Update** workflow runs on `release: published`.

---

## Combat Flow (Weapon Attack → Damage → Wounds)

Source: `module/sheets/actor-sheet.mjs`, `module/helpers/chat.mjs`, `module/helpers/dice.mjs`

### Step 1 — Attack roll

Clicking the roll icon on a weapon in the Combat tab (or via `game.sla.rollOwnedItem`) opens an attack dialog. The system:

1. Computes the dice pool: `1d10 (Success Die) + (skill_rank + 1)d10 (Skill Dice)`.
2. Applies recoil, attack penalty, reserve dice adjustments, and the configured TN (default 10).
3. Evaluates the roll and passes it to `calculateRollResult()`.

### Step 2 — MOS resolution

`getMOS(result)` maps skill hit count to a tactical outcome:

| Skill dice hits | MOS outcome |
|---|---|
| 0 | Fail |
| Success Die only | Standard Hit |
| 1 | +1 Damage |
| 2 | MOS 2 — choose: +2 Damage **or** Arm Wound |
| 3 | MOS 3 — choose: +4 Damage **or** Leg Wound |
| 4+ | Head Shot (+6 Damage) — auto-applied, no choice |

"Success Through Experience" fires when the Success Die fails but 4+ skill dice hit; no MOS bonus, just a standard hit.

### Step 3 — Chat card

`SLAChat.executeStandardDamageRoll()` posts a damage card with:

- **Standard damage button** (`.damage-roll`) — rolls `weapon.damage + damage_bonus + ad_bonus`.
- **Tactical choice buttons** (MOS 2/3) — separate Damage and Wound buttons.
- **Apply Damage button** — applies final total minus target PV; posts a wound check prompt.
- **Luck button** — opens `LuckDialog` to reroll the Success Die.
- **Adjust TN button** — re-evaluates the roll against a new TN (useful for range modifiers applied after rolling).

Chat state is persisted on `ChatMessage.flags.sla`:

| Flag | Type | Purpose |
|---|---|---|
| `targets` | `string[]` | Token UUIDs for apply-damage buttons |
| `autoApply` | `boolean` | Auto-apply wound on head-shot |
| `isEbb` | `boolean` | Identifies Ebb roll cards |
| `ebbRollSuccess` | `boolean` | Guards damage/heal buttons on failed Ebb rolls |
| `ebbHealWoundMutualExclude` | `boolean` | Heal and wound buttons are mutually exclusive |
| `ebbHealWoundPathUsed` | `"heal"\|"wounds"` | Which Ebb path was already used |

### Step 4 — Damage application

`_applyDamageToTarget(finalTotal, adValue, targetUuid)` in `chat.mjs`:

1. Looks up the target actor by UUID.
2. Subtracts `system.armor.pv` from `finalTotal`. Armour Piercing (AP) ammo applies an additional −2 PV.
3. Updates `system.hp.value` (clamped to 0..max).
4. If the wound button was used: toggles the relevant `system.wounds.<location>` flag.

### Wound cascade

`BoilerplateActor._handleWoundEffects()` runs on every wound field change:

- **Head wound** → applies `stunned` status effect.
- **Both leg wounds** → applies `immobile` status effect.
- **Any wound** → applies `bleeding` status effect. Exception: Frothermorfs with exactly **one** wound do not bleed (Feel No Pain).
- **6 wounds** → sets HP to 0 and applies `dead` overlay.

HP threshold monitoring runs separately in `_handleWoundThresholds()`:

- HP ≤ 0 → `dead`.
- `0 < HP ≤ floor(max / 2)` → `critical` (−2 STR, −2 DEX, −1 CONC, −1 COOL applied in `_applyPenalties`).

---

## Encumbrance

Source: `module/documents/actor.mjs` (`_calculateEncumbrance`)

Encumbrance applies to **character** actors only.

### Carry capacity

```
max = max(8, STR_total × 3)
```

### Item weight

- Each item contributes `weight × quantity` to the total.
- **Powered armor** that is destroyed (`resistance.value ≤ 0`) counts as **6** weight regardless of its nominal weight.

### Penalty thresholds

| Remaining capacity (`max − value`) | Penalty |
|---|---|
| ≥ 2 | None |
| 1 | −1 DEX; Rushing capped at 1 |
| 0 | −2 DEX; Rushing capped at 1 |
| < 0 (over limit) | Immobile |

Encumbrance penalty is applied to DEX in `_applyPenalties` after stat totals are computed. The Rushing cap is enforced in `_calculateDerived`.

---

## XP and Advancement

Source: `module/apps/xp-dialog.mjs`

Open the XP dialog from the character sheet header (coin icon). The dialog has two modes based on the user role.

### GM mode

GMs can add or remove a flat XP amount with a reason. Every change appends a ledger entry to `system.xpLedger`.

### Player mode

Players spend XP to purchase upgrades during downtime. Changes are queued as pending before committing.

**Cost formulas (from source):**

| Upgrade | XP cost | Credit cost |
|---|---|---|
| New skill (rank 1) | 2 | — |
| Skill rank increase | `2 + (3 × current_rank)` | +500 at rank 4 |
| New discipline (rank 1) | 2 | — |
| Discipline rank increase | `2 + (3 × current_rank)` | — (+3 XP at rank 4) |
| Stat increase (+1) | `5 + current_value` per rank | — |

Each stat can increase by at most **1 rank per downtime period**. When STR increases, HP value and max are both incremented immediately to account for the new hit point.

### XP ledger

`system.xpLedger` is an array of entries appended (never overwritten). Each entry:

```js
{
  timestamp: Number,      // Date.now()
  type: String,           // "add" | "remove" | "stat" | "skill" | "discipline"
  description: String,    // Human-readable reason
  xpChange: Number,       // Positive = gain, negative = spend
  creditChange: Number,   // Positive = gain, negative = spend
  details: Object         // Optional: { stat, oldValue, newValue } etc.
}
```

The ledger is displayed (newest-first) in the XP dialog and is purely a historical record — it does not drive any derived values.

---

## Ammo Types and Modifiers

Source: `module/config.mjs` (`SLA.ammoTypes`, `SLA.ammoModifiers`)

| Key | Label | Damage mod | AD mod | PV mod |
|---|---|---|---|---|
| `standard` | Standard | 0 | 0 | 0 |
| `he` | High Explosive (HE) | +1 | +1 | 0 |
| `ap` | Armour Piercing (AP) | 0 | 0 | −2 (at target) |
| `shotgun_std` | Shotgun Shot (Standard) | 0 | 0 | 0 |
| `shotgun_slug` | Shotgun Slug | +1 | −1 | 0 |

`AD` (Armour Damage) reduces the target's armor resistance on hit. The AP −2 PV modifier is applied during damage resolution in `_applyDamageToTarget`, not pre-roll.

Magazines carry an `ammoType` field that matches these keys. When a magazine is loaded into a weapon, the weapon inherits the ammo type for that firing session.

---

## Powersuit Mechanics

Source: `module/documents/actor.mjs` (`_applyArmorModifiers`)

Powersuits are armor items with both `system.powered = true` and `system.powersuit = true`. They interact with stats differently from standard powered armor.

### Selecting the active powersuit

If an actor has multiple equipped powered armor items flagged as `powersuit`, the system selects the one with the highest `resistance.value`. Only one powersuit applies its override effects at a time.

### Effects of the active powersuit

| Field | Effect |
|---|---|
| `mods.str` | **Replaces** the actor's STR total entirely (not additive) |
| `mods.dex` | **Added** to DEX total |
| `dexCap` | Caps DEX total to this value (applied after `mods.dex`) |
| `initBonus` | Added to the initiative bonus accumulator |
| `mods.move.closing` / `mods.move.rushing` | Added to base movement from species item |

### Non-powersuit powered armor

Armor marked `powered = true` but `powersuit = false` applies STR and DEX mods **additively** (no replacement, no cap). Multiple such pieces stack.

### Resistance sync

When the token bar for `armor.resist` is edited, `_preUpdate` finds the equipped powered armor item and writes back to `system.resistance.value` on the item. The actor-level `system.armor.resist` is a derived display value and is not persisted directly.

---

## Token Ruler Colors

Source: `module/canvas/sla-ruler.mjs`

The `SLATokenRuler` colors the movement ruler in real-time as a token is dragged.

### Characters and NPCs

| Color | Meaning |
|---|---|
| Green (`#39ff14`) | Within Closing speed |
| Yellow | Between Closing and Rushing speed |
| Red | Exceeds Rushing speed |

### Vehicles

| Color | Meaning |
|---|---|
| Green (`#39ff14`) | Within `move.value` |
| Red | Exceeds `move.value` |

### Combat movement lock

If the **Enable Combat Movement Lock** world setting is active and the actor has already used their movement action this turn, the entire ruler is rendered **red** regardless of distance.

---

## Coding Conventions

- **Application V2 only:** All new sheets and dialogs use `ApplicationV2` + `HandlebarsApplicationMixin`. No `Dialog`, no jQuery-based V1 sheets.
- **No jQuery in new code:** Event delegation uses native DOM (`closest`, `addEventListener`). `AbortController` is used for `_onRender` cleanup.
- **Active Effects targeting:** Target `system.stats.<key>.bonus` (mode Add), never `.value`, so base stats are not overwritten by effects.
- **Foundry v14 constants:** Use `CONST.ACTIVE_EFFECT_CHANGE_TYPES` (not deprecated `ACTIVE_EFFECT_MODES`).
- **Circular dependencies:** Sheet classes are loaded via dynamic `import()` in `sla-hotbar.mjs` to break the `actor-sheet → sla-hotbar → actor-npc-sheet → actor-sheet` cycle.
- **Prettify:** All new code must pass project formatting (Prettier). Run your formatter before committing.
