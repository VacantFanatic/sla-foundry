# SLA Industries: World Settings Reference

All settings are under **Game Settings → System Settings** and are scoped to **world** (GM only).

---

## Combat Settings

### Enable Combat Movement Lock

**Key:** `enableCombatMovementLock` | **Default:** on

When enabled, the active combatant can move **once per turn**. A second movement attempt is blocked with a warning. Undoing movement (Ctrl+Z) clears the lock so the combatant can move again. Disable this setting to allow multiple movement updates per turn (e.g. for fast narrative play or vehicles).

**How it works:** The system tracks movement state in memory per `combatId:combatantId`. State resets at the start of each new turn via the `combatTurn` hook.

---

### Enable Automatic Wound Penalties

**Key:** `enableAutomaticWoundPenalties` | **Default:** on

Applies wound count as a negative modifier to all dice rolls. Each wound reduces the effective skill dice pool. Disable to track wounds visually without mechanical penalty (useful for simple NPC encounters or narrative scenes).

---

### Enable NPC Wound Tracking

**Key:** `enableNPCWoundTracking` | **Default:** on

When enabled, Threat/NPC actor sheets display wound location checkboxes and the system applies wound logic (bleeding, critical, etc.) to NPCs. When disabled:

- The wounds section is hidden on NPC sheets.
- The **Inflict Wound** button is hidden on weapon chat cards when the target is an NPC (the +Damage button remains).

---

## Weapon & Attack Settings

### Enable Long Range Feature

**Key:** `enableLongRangeFeature` | **Default:** on

When enabled, ranged attacks at targets **beyond half** the weapon's maximum range apply a **−1 Skill Die** penalty. Disable for simplified range handling.

---

### Enable Target-Required Features

**Key:** `enableTargetRequiredFeatures` | **Default:** on

When enabled, ranged attacks require a token target. The system calculates range, applies long-range penalties, and gates attack options on target selection. When disabled, attacks can be made without a target and range calculations are skipped — useful for narrative rolls or theater-of-the-mind play.

---

### Enable Automatic Ammo Consumption

**Key:** `enableAutomaticAmmoConsumption` | **Default:** on

When enabled, the system reduces weapon ammo automatically on each ranged attack based on the selected firing mode's `rounds` value. Disable to track ammo manually.

---

### Enable Low Ammo Validation

**Key:** `enableLowAmmoValidation` | **Default:** on

When enabled:

- Prevents firing high-ammo-cost firing modes when current ammo is insufficient.
- Applies a **−2 Damage** penalty when firing the lowest available mode on an empty or near-empty clip.

Disable to remove these restrictions (ammo tracking must still be on for the penalty to apply).

---

## Explosive Settings

### Enable Explosive Throw Automation

**Key:** `enableExplosiveThrowAutomation` | **Default:** on

When enabled, explosive throws:

1. Prompt the GM/player to click a canvas aim point.
2. Check the throw path for wall collisions and clamp to the nearest wall hit.
3. Apply random deviation scaled to throw distance.
4. Check the deviation path for wall collisions.
5. Display a live dashed preview before confirming placement.
6. Place two blast **Region** templates (kill zone and max blast) at the detonation point.

When disabled, the throw still rolls dice and decrements quantity, but placement is handled manually.

---

### Explosive Blast Region Visibility

**Key:** `blastRegionVisibility` | **Default:** `observer`

Controls who sees the blast `Region` documents created by explosive automation.

| Option     | Who sees it                    |
| ---------- | ------------------------------ |
| `observer` | Owners and GM only             |
| `always`   | Any user who can see the scene |

The `always` option aligns with Foundry v14.360+ measured-template visibility behavior. Use it for player-visible blast zones in open combat.

---

## Migration & World Backup

### Download JSON Backup Before Migration

**Key:** `enableMigrationWorldBackup` | **Default:** on

When the system detects that world data needs to be migrated to a newer version, the active GM's browser automatically downloads a JSON snapshot of the world (actors, items, scenes, journal entries, macros, playlists, roll tables, combats, folders, users, and cards). Chat messages and fog exploration are excluded to keep the file smaller.

Disable only if the download is problematic (e.g. very large worlds where the browser download hangs). The migration will still run; you lose the safety net of the backup file.

The backup file name format is:

```
sla-migration-backup_<world-id>_<timestamp>.json
```

---

## Developer Notes

All settings are registered in `module/sla-industries.mjs` during the `init` hook. Settings that affect runtime behavior (movement lock, wound penalties, ammo, etc.) are read at the point of use via `game.settings.get("sla-industries", "<key>")` rather than being cached, so changes take effect immediately without a reload.
