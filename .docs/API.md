# `game.sla` Public API Reference

Registered on the `game` object during Foundry's `init` hook (`module/sla-industries.mjs`).
Available to macros, hotbar scripts, and external module integrations.

## Stability

Follows this project's [Semantic Versioning](https://semver.org/) policy (see
[.docs/RELEASE.md](RELEASE.md)): a MINOR release only adds members or optional parameters; a
function is never removed or given an incompatible signature change without a MAJOR release.
Check for a member before calling it if you support older installed versions:

```js
if (game.sla?.reloadWeapon) {
    await game.sla.reloadWeapon(weaponUuid);
}
```

## Index

| Member                                                                   | Kind     | Added in | Summary                                                              |
| ------------------------------------------------------------------------ | -------- | -------- | -------------------------------------------------------------------- |
| [`rollOwnedItem(itemUuid)`](#gaslarollowneditemitemuuid)                 | Function | 2.0.0    | Roll/use an owned item the same way its sheet control would          |
| [`addActorItemToHotbar(item)`](#gaslaaddactoritemtohotbaritem)           | Function | 2.0.0    | Create/reuse a hotbar macro for an embedded item                     |
| [`canTokenMoveThisTurn(tokenLike)`](#gaslacantokenmovethisturntokenlike) | Function | 2.4.3¹   | Check the per-turn movement lock                                     |
| [`reloadWeapon(weaponUuid)`](#gaslareloadweaponweaponuuid)               | Function | 2.13.0   | Reload a weapon the same way its sheet control would                 |
| [`toggleItemEquipped(itemUuid)`](#gaslatoggleitemequippeditemuuid)       | Function | 2.13.0   | Toggle an item's equipped state the same way its sheet control would |
| [`SlaActor` / `SlaItem`](#gaslaslaactor--gaslaslaitem)                   | Class    | 2.0.0    | Registered `Actor`/`Item` document classes                           |

¹ Version of the Combat Movement Lock feature per `CHANGELOG.md`; this repo's shallow clone history
doesn't confirm the exact commit that first exposed it on `game.sla` specifically — verify against
full project history before treating this as authoritative.

---

## `game.sla.rollOwnedItem(itemUuid)`

**Added in:** 2.0.0

**Signature:** `rollOwnedItem(itemUuid: string): Promise<void>`

### Parameters

| Name       | Type     | Required | Description                                                    |
| ---------- | -------- | -------- | -------------------------------------------------------------- |
| `itemUuid` | `string` | Yes      | Full UUID of an actor-embedded item, e.g. `Actor.xxx.Item.yyy` |

### Returns

`Promise<void>` — resolves once the action completes (a roll, a dialog opening, a dose consumed,
etc.). Does not report success/failure; see **Errors**.

### Behavior by item type

| Type         | Action                            |
| ------------ | --------------------------------- |
| `weapon`     | Opens the weapon attack dialog    |
| `explosive`  | Opens the explosive throw dialog  |
| `ebbFormula` | Rolls the formula and spends flux |
| `drug`       | Consumes one dose                 |
| `skill`      | Executes the skill roll flow      |
| Any other    | Opens the item sheet              |

### Errors

Never throws. Invalid input, a missing item, an item not on an actor, or an item you don't own
each produce a `ui.notifications.warn(...)` and the promise resolves with no further action.

### Example

```js
await game.sla.rollOwnedItem('Actor.abc123.Item.def456');
```

**Source:** `module/helpers/sla-hotbar.mjs`

---

## `game.sla.addActorItemToHotbar(item)`

**Added in:** 2.0.0

**Signature:** `addActorItemToHotbar(item: Item): Promise<void>`

### Parameters

| Name   | Type   | Required | Description                                         |
| ------ | ------ | -------- | --------------------------------------------------- |
| `item` | `Item` | Yes      | An actor-embedded item document (not a UUID string) |

### Returns

`Promise<void>`.

### Behavior

Creates a script macro (or reuses an existing one for the same item) that calls
`game.sla.rollOwnedItem(item.uuid)`, and assigns it to the first free hotbar slot.

### Errors

Never throws. Warns via `ui.notifications` and does nothing if the hotbar is full.

### Example

```js
await game.sla.addActorItemToHotbar(someOwnedItem);
```

**Source:** `module/helpers/sla-hotbar.mjs`

---

## `game.sla.canTokenMoveThisTurn(tokenLike)`

**Added in:** 2.4.3¹ (see index footnote)

**Signature:** `canTokenMoveThisTurn(tokenLike: Token | TokenDocument): boolean`

### Parameters

| Name        | Type                     | Required | Description        |
| ----------- | ------------------------ | -------- | ------------------ |
| `tokenLike` | `Token \| TokenDocument` | Yes      | The token to check |

### Returns

`boolean` — `true` if the token may move this turn.

### Behavior

Respects the **Enable Combat Movement Lock** world setting and the per-turn movement state tracked
for the current combat. Always returns `true` when the setting is off or no combat is active.

### Example

```js
if (game.sla.canTokenMoveThisTurn(token)) {
    // allow the move
}
```

**Source:** `module/sla-industries.mjs`

---

## `game.sla.reloadWeapon(weaponUuid)`

**Added in:** 2.13.0

**Signature:** `reloadWeapon(weaponUuid: string): Promise<boolean>`

### Parameters

| Name         | Type     | Required | Description                                                           |
| ------------ | -------- | -------- | --------------------------------------------------------------------- |
| `weaponUuid` | `string` | Yes      | Full UUID of an actor-embedded weapon item, e.g. `Actor.xxx.Item.yyy` |

### Returns

`Promise<boolean>` — `true` if a magazine was found and consumed, `false` otherwise.

### Behavior

Executes the same action as clicking a weapon's Reload button on an actor sheet, without requiring
a rendered sheet. Magazine matching is name-based (`system.linkedWeapon` stores the weapon's
`.name`), same as the sheet's Reload button — renaming a weapon breaks existing magazine links
either way.

| Candidates found                      | Result                                                                                                                                                                                                                                                                                       |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exactly one linked, in-stock magazine | Reloads automatically                                                                                                                                                                                                                                                                        |
| Zero                                  | Warns, returns `false`                                                                                                                                                                                                                                                                       |
| More than one                         | **Prompts** with the same ammo-selection dialog the sheet's Reload button uses (a Foundry Application window, not tied to any sheet being open). Resolves once the dialog closes: `true` if a magazine was picked and consumed, `false` if the dialog was cancelled/closed without a choice. |

### Errors

Never throws. Returns `false` (with a `ui.notifications.warn`) for: an invalid/malformed UUID, a
UUID that doesn't resolve to an item, an item not on an actor, an item you don't own, an item that
isn't a `weapon`, or zero matching magazines. When more than one magazine matches, the promise
still resolves `false` if the ammo-selection dialog is dismissed without a choice — this is not an
error, just a declined prompt.

### Example

```js
const reloaded = await game.sla.reloadWeapon(weapon.uuid);
if (!reloaded) {
    // no matching magazine, or the ammo-selection dialog was dismissed without a choice
}
```

**Source:** `module/helpers/sla-hotbar.mjs`, `module/sheets/actor/reload.mjs`

---

## `game.sla.toggleItemEquipped(itemUuid)`

**Added in:** 2.13.0

**Signature:** `toggleItemEquipped(itemUuid: string): Promise<boolean | undefined>`

### Parameters

| Name       | Type     | Required | Description                                                    |
| ---------- | -------- | -------- | -------------------------------------------------------------- |
| `itemUuid` | `string` | Yes      | Full UUID of an actor-embedded item, e.g. `Actor.xxx.Item.yyy` |

### Returns

`Promise<boolean | undefined>` — the item's new `equipped` state on success, or `undefined` if the
toggle could not be performed.

### Behavior

Executes the same action as clicking an item's equip/holster toggle on an actor sheet, without
requiring a rendered sheet. Only applies to item types that have that toggle on the sheet:
`weapon`, `armor`, and `item` (Gear). Syncs the item's embedded Active Effects onto the actor to
match the new state (applied while equipped, removed when unequipped).

### Errors

Never throws. Returns `undefined` (with a `ui.notifications.warn`) for: an invalid/malformed UUID,
a UUID that doesn't resolve to an item, an item not on an actor, an item you don't own, or an item
type other than `weapon`/`armor`/`item`.

### Example

```js
const nowEquipped = await game.sla.toggleItemEquipped(gear.uuid);
```

**Source:** `module/helpers/sla-hotbar.mjs`, `module/documents/item.mjs`

---

## `game.sla.SlaActor` / `game.sla.SlaItem`

**Added in:** 2.0.0

The registered `Actor`/`Item` document classes (`CONFIG.Actor.documentClass` /
`CONFIG.Item.documentClass`). Legacy names `BoilerplateActor`/`BoilerplateItem` remain on
`game.boilerplate` and as module export aliases for backward compatibility.

**Source:** `module/sla-industries.mjs`
