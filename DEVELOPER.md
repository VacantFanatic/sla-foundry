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

---

## Coding Conventions

- **Application V2 only:** All new sheets and dialogs use `ApplicationV2` + `HandlebarsApplicationMixin`. No `Dialog`, no jQuery-based V1 sheets.
- **No jQuery in new code:** Event delegation uses native DOM (`closest`, `addEventListener`). `AbortController` is used for `_onRender` cleanup.
- **Active Effects targeting:** Target `system.stats.<key>.bonus` (mode Add), never `.value`, so base stats are not overwritten by effects.
- **Foundry v14 constants:** Use `CONST.ACTIVE_EFFECT_CHANGE_TYPES` (not deprecated `ACTIVE_EFFECT_MODES`).
- **Circular dependencies:** Sheet classes are loaded via dynamic `import()` in `sla-hotbar.mjs` to break the `actor-sheet → sla-hotbar → actor-npc-sheet → actor-sheet` cycle.
- **Prettify:** All new code must pass project formatting (Prettier). Run your formatter before committing.
