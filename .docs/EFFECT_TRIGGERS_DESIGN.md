# Design spike: per-effect `applyOn` and centralized effect triggers

Status: **proposal; stage 1 done** (pure table + golden test, not yet called by any runtime
code). Written after comparing this system's Active Effects with the Wrath & Glory Foundry system (see issue #412 for the larger, deferred ideas:
Target/Area/Aura transfer, scripts, round/turn durations).

## Problem

An item's embedded Active Effects only reach the actor through `SlaItem#applyItemEffectsToActor`
(`module/documents/item.mjs`); Foundry's native `effect.transfer` is deliberately inert. _Which_
event calls it, and what removes the copy again, is decided per item type and scattered across
call sites:

| Item type                 | Applies on                                     | Call site                                                        | Removed when                              |
| ------------------------- | ---------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------- |
| `item`, `weapon`, `armor` | Equip toggle (and NPC drop auto-equip)         | `SlaItem#setEquipped`, `createEquippedItem` in `actor-drops.mjs` | Unequip, item deleted from the actor      |
| `trait`                   | Item created on the actor                      | `SlaActor#_onCreateDescendantDocuments` (`actor.mjs`)            | Item deleted from the actor               |
| `drug`                    | Active toggle, or "use dose" (`item-use-drug`) | `SlaItem#toggleActive`, `item-actions.mjs`                       | Active toggled off (not by the dose path) |
| `toxicant`                | Failed infection test                          | `SlaItem#rollInfectionTest`                                      | Never (no removal path)                   |
| `ebbFormula`              | GM clicks the chat button, on a chosen target  | `onApplyEbbEffects` in `helpers/chat/handlers.mjs`               | Re-applying replaces it; otherwise never  |

Every row is a hand-wired special case. This has produced real bugs: #363/#369 (gear toggle
missing), the NPC auto-equip writer that skipped the sync, and the weapon/armor delete leak found
while restoring their Effects tab. All three are the class DESIGN_PRINCIPLES #4 and #5 describe
(side effects belong at descendant-document hooks, and a side-effecting setter must be the only
writer).

Two smaller facts matter for sizing the work:

- No shipped compendium item carries an embedded effect or `equipped: true`, so existing world
  data is the only migration surface, and it can be left untouched (see "Defaults" below).
- A GM macro or import that creates an item with `system.equipped: true` skips the effect sync
  today; only `createEquippedItem` handles it. I found no current producer in the repo, so this is
  latent rather than live.

## Options considered

| Option                                                                  | Verdict                                                                                                                                  |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| A. Keep per-type wiring, document it                                    | Cheapest, but the next trigger or writer reintroduces the same bug class.                                                                |
| **B. One trigger table + central sync + optional per-effect `applyOn`** | **Recommended**, staged below.                                                                                                           |
| C. Full W&G Transfer Type model (Target/Area/Aura)                      | Real feature work with canvas templates; tracked in #412, not a refactor.                                                                |
| D. Custom `ActiveEffect` DataModel subtype                              | Right home if several per-effect fields accumulate (conditions, #412). Heavier: `documentTypes`, a migration, and a custom config sheet. |

## Recommended design (option B)

### Trigger vocabulary

A small closed set, stored per effect, defaulting from the item type when absent:

| `applyOn`  | Meaning                                      | Applied by                             | Removed by                     |
| ---------- | -------------------------------------------- | -------------------------------------- | ------------------------------ |
| `equipped` | While `system.equipped` is true              | create-with-equipped / equipped → true | equipped → false, item deleted |
| `owned`    | While the actor owns the item                | item created on the actor              | item deleted                   |
| `active`   | While `system.active` is true (drugs)        | active → true, drug dose used          | active → false (not on delete) |
| `manual`   | Only when code or a GM explicitly applies it | `applyManual(actor)` (toxicant, Ebb)   | replaced on re-apply           |

Type defaults reproduce today's behaviour exactly: `item`/`weapon`/`armor` → `equipped`,
`trait` → `owned`, `drug` → `active`, `toxicant` and `ebbFormula` → `manual`.

Drugs are the one type where delete must _not_ remove the effect: using the last dose deletes
the item right after applying it. Encode that in the table above (`active` and `manual` are never
removed by delete) rather than as a type exclusion list, which is what the Weapon/Armor change
had to do (`EFFECT_CLEANUP_ON_DELETE_TYPES` in `module/documents/actor.mjs`).

### Where the logic lives

1. **Pure module** `module/documents/derived/effect-triggers.mjs` (no `game`/`Hooks`), per
   DESIGN_PRINCIPLES #1:
    - `DEFAULT_APPLY_ON` — the type table above.
    - `resolveApplyOn(effectData, itemType)` — flag if valid, else the type default.
    - `effectsToApply(effects, itemType, event)` / `effectsToRemove(...)` — filter by event.
2. **One glue method** on `SlaItem`, e.g. `syncEffects(actor, event)`, replacing the separate
   apply/remove calls in `setEquipped`, `toggleActive`, `rollInfectionTest`,
   `onApplyEbbEffects` and the species/trait hooks. Removal must be trigger-aware: copies keep
   the source's `applyOn` (they are `toObject()` duplicates), so unequip removes only
   `origin === item.uuid && applyOn === 'equipped'`. That is what makes mixed items safe.
3. **Actor descendant hooks** as the only place state changes are observed
   (`_onCreateDescendantDocuments`, a new `_onUpdateDescendantDocuments` watching
   `system.equipped` / `system.active`, `_onDeleteDescendantDocuments`), guarded by the existing
   `game.user.id === userId` check. `setEquipped`/`toggleActive` then just write the field, and
   _any_ writer (sheet, hotbar, macro, import, NPC drop) gets the sync. This is what closes the
   writer-audit class instead of auditing it again.

### Where the flag is stored and edited

- Store at `flags.sla-industries.applyOn` on the effect. No schema, no migration; absent means
  "type default". (Message flags in this repo use `flags.sla`; effect flags should use the system
  id, matching `getFlag('sla-industries', ...)` elsewhere.)
- Edit it as a small `<select>` on each row of the **item sheet's Effects tab** (the rows already
  show the change summary and Disabled badge). That avoids customizing Foundry's stock
  `ActiveEffectConfig`, which this system has deliberately never touched.
- Hide the selector for types whose only meaningful value is fixed, or show the default as the
  first option ("Default (equipped)"), so a GM is never asked to choose for a type with one
  trigger (DESIGN_PRINCIPLES #7).

## Staging

Each stage ships on its own and leaves behaviour unchanged unless stated.

1. **Pure table + golden test (done).** `module/documents/derived/effect-triggers.mjs` holds the
   type → event → apply/remove table, and `tests/unit/derived-effect-triggers.test.mjs` asserts the
   exact behaviour in the first table, written from the call sites rather than from the module. No
   runtime change. This is the regression net for everything after.
2. **Route existing call sites through `syncEffects`.** Still no new behaviour; delete the
   duplicated apply/remove code. e2e: the existing #363/#369/weapon/armor/delete specs must stay
   green unchanged.
3. **Centralize on actor hooks.** Adds `_onUpdateDescendantDocuments`; fixes the latent
   "created with `equipped: true`" gap. New e2e: create an item with `system.equipped: true` and an
   effect via `createEmbeddedDocuments` and assert the effect lands; flip `system.active` through a
   plain `item.update` and assert the same. Watch for rapid double toggles, since apply is
   remove-then-create.
4. **Per-effect `applyOn` + row selector.** The only user-visible feature. Needs a real-template
   e2e that picks a value in the Effects tab and observes the actor (see CLAUDE.md on #363 → #369).
5. **Optional, later:** a declarative condition field alongside `applyOn` (part of #412).

## Honest assessment

The valuable part is stages 1–3: one trigger table, one sync method, and observing state at actor
hooks. They remove the bug class that has now bitten four times. The per-effect flag (stage 4) is
the least valuable part today, because every existing type has exactly one trigger, so it only
pays off for mixed items (for example a weapon with a while-equipped bonus plus a manual
"on hit" effect). If no GM has asked for that, stop after stage 3.

## Open questions for the maintainer

1. Is there a concrete item that needs two different triggers? That decides whether stage 4 is
   worth building at all.
2. Should `owned` be available on gear/weapons (always-on, no equip needed), or stay trait-only?
3. Is `flags.sla-industries.applyOn` acceptable, or do you want to wait and pay for a custom
   `ActiveEffect` DataModel once conditions land?
4. Toxicant effects currently have no removal path at all. Should `manual` effects get a
   "remove" button on the actor's Effects tab, or is the existing delete control enough?

## Test and doc obligations when this is built

Pure unit tests for the table, e2e through the real sheets (not hand-built DOM), updates to
`DEVELOPER.md` ("Active Effects and stats" and the descendant-hook notes), `item_setup.md` (the
type/trigger table), `CHANGELOG.md`, and a `LESSONS_LEARNED.md` entry.
