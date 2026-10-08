# Design spike: per-effect `applyOn` and centralized effect triggers

Status: **stages 1–4 done** (pure table + golden test; every call site routed through
`SlaItem#syncEffects`; actor hooks observe `equipped`/`active` writes; per-effect `applyOn` selector on
the item Effects tab). Written after comparing this system's Active Effects with the Wrath & Glory Foundry system (see issue #412 for the larger, deferred ideas:
Target/Area/Aura transfer and scripts; round/turn durations have since been built, see below).

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
had to do (an `EFFECT_CLEANUP_ON_DELETE_TYPES` set in `module/documents/actor.mjs`, since replaced by the table's `delete` event).

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
2. **Route existing call sites through `syncEffects` (done).** `applyItemEffectsToActor` and
   `_removeEffectsByOrigin` are gone; `setEquipped`, `toggleActive`, `rollInfectionTest`, the Ebb
   apply button, the drug-dose handler, the NPC auto-equip drop and the actor's
   create/delete descendant hooks all call `syncEffects(actor, event)`. No new behaviour. The
   hooks now call it for every non-species item and let the table decide, which replaces the
   `EFFECT_CLEANUP_ON_DELETE_TYPES` set. The existing #363/#369/weapon/armor/delete, operators,
   drug-dose, NPC-drop and trait specs are the check. Not covered by any e2e: the failed-infection
   (toxicant) path, which needs a stubbed roll.
3. **Centralize on actor hooks (done).** `SlaActor#_onUpdateDescendantDocuments` (new) syncs on any
   `system.equipped` / `system.active` change, and `_onCreateDescendantDocuments` now also fires
   `equip` / `activate` for an item created already equipped or active
   (`eventsForItemUpdate` / `eventsForItemCreate` in `effect-triggers.mjs`). So `setEquipped`,
   `toggleActive` and the NPC auto-equip drop no longer sync themselves: they write the field and
   `await item.effectsSettled()`, because the hooks start the sync without awaiting it. Syncs for one
   item run through a per-item queue (`helpers/keyed-queue.mjs`), since apply is delete-then-create and
   overlapping runs from rapid toggles would double-create. This closes the latent "created with
   `equipped: true`" gap. Real-document e2e (`regression-sheet-click.spec.js`, "stage 3"): created
   already equipped, a plain `item.update`, and five rapid flips ending in exactly one copy. Each
   fails when its piece (update hook, create-time equip, queue) is removed.
4. **Per-effect `applyOn` + row selector (done).** Each row on the item sheet's Effects tab gets a
   "when this effect applies" dropdown for item types with more than one real trigger. It stores
   `flags['sla-industries'].applyOn` on the embedded effect (`setFlag`); "Default (…)" unsets it so the
   effect follows its item type again. The offered values come from `APPLY_ON_CHOICES` in
   `effect-triggers.mjs`, which lists only triggers that exist for the type, so the control never
   offers something inert (DESIGN_PRINCIPLES #7):

    | Type                      | Offered (default first) | Why                                                   |
    | ------------------------- | ----------------------- | ----------------------------------------------------- |
    | `item`, `weapon`, `armor` | equipped, owned         | Equip toggle exists only for these                    |
    | `drug`                    | active, owned           | `system.active` and its toggle exist only on drugs    |
    | `ebbFormula`              | manual, owned           | The Ebb apply button is the only manual trigger       |
    | `trait`                   | _(no selector)_         | Only `owned` is possible, so there is nothing to pick |
    | `toxicant`                | _(no selector)_         | `owned` is excluded: it would skip the infection test |

    `manual` is deliberately not offered on weapons or armor: nothing in the system applies a manual
    effect for them, so a "weapon with an on-hit effect" is not buildable with this flag alone (that
    needs the roll-time work in #412). A stored kind that is no longer offered for a type stays visible
    in the dropdown instead of being hidden. Copies already on an actor keep the flag they were copied
    with, so a change applies the next time the trigger fires, not retroactively. Real-sheet e2e
    (`regression-item-sheets.spec.js`): the selector appears only for multi-trigger types, picking a
    value stores the flag and Default clears it, and a gear item with a while-equipped effect plus an
    effect switched to `owned` through the real dropdown delivers +1 on grant, +3 when equipped, +1 when
    unequipped and nothing after delete. That test fails when the table ignores the flag.

5. **Optional, later:** a declarative condition field alongside `applyOn` (part of #412).

## Honest assessment

The valuable part was stages 1–3: one trigger table, one sync method, and observing state at actor
hooks. They remove the bug class that bit four times. Stage 4 is the least valuable part today:
the only mixed-trigger items it enables are an `owned` effect next to an `equipped` one on
gear/weapons/armor, an `owned` effect on a drug alongside its `active` one, and an `owned` passive on
an Ebb formula. If no GM wants those, the selector is harmless (hidden where it cannot matter) but
adds a control to maintain.

## Open questions (answered by the stage 4 implementation, revisit if wrong)

1. _Is there a concrete item that needs two different triggers?_ Unconfirmed. Stage 4 was built
   because it was asked for; the cases above are the ones it enables.
2. _Should `owned` be available on gear/weapons?_ Yes: it works for every type with an Effects tab
   except toxicants.
3. _Flag or a custom `ActiveEffect` DataModel?_ A flag, with no migration (absent means the type
   default). Revisit when conditions (#412) add more per-effect fields.
4. _Remove button for `manual` effects?_ Still open. Toxicant and Ebb copies are only removed by
   re-applying or by deleting the effect on the actor.

## Test and doc obligations when this is built

Pure unit tests for the table, e2e through the real sheets (not hand-built DOM), updates to
`DEVELOPER.md` ("Active Effects and stats" and the descendant-hook notes), `item_setup.md` (the
type/trigger table), `CHANGELOG.md`, and a `LESSONS_LEARNED.md` entry.

## Durations (follow-up)

The Duration text on a drug, the game clock, the `secondsPerRound` world setting and the drug switch-off are
documented in [item_setup.md](item_setup.md) and [DEVELOPER.md](DEVELOPER.md) ("Active Effects and stats").
They sit beside this design rather than in it: durations are a property of the copied effect, while this document
decides when a copy is made or removed.
