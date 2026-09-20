# SLA Industries: The Ebb System

This document covers the Ebb system for GMs and developers: how formulas are rolled, how results are applied, and how the various options interact.

---

## Overview

The Ebb is available only to **Ebonite** operatives. The system identifies Ebonites by checking whether the actor's **Species** item name contains the string `"ebonite"` (case-insensitive). When that match is found:

- The actor sheet shows an **Ebb** sidebar tab containing Disciplines and nested Formulas.
- The **Combat** tab shows wounds and loadout only (no Ebb content).

Non-Ebonite actors never see the Ebb tab. If an actor had a saved active tab of `ebb` before gaining/losing Ebonite status, the sheet redirects to **Combat** automatically.

---

## Dice Pool

An Ebb Formula roll uses:

```
1d10 (Success Die) + (disciplineRank + 1)d10 (Skill Dice)
```

The **Success Die** (`1d10`) determines pass/fail against the **Formula Rating** (Target Number). The **Skill Dice** produce **Margin of Success (MOS)** on a hit.

**FLUX cost** is deducted from the caster's current Flux before the roll. The cost is `system.cost` on the Formula item (minimum 0, defaults to 1 if unset).

---

## Formula Item Fields

| Field               | Schema key                                           | Notes                                                                                   |
| ------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Formula Rating (TN) | `system.formulaRating`                               | Default 7. The target number for the Success Die.                                       |
| Flux Cost           | `system.cost`                                        | Default 1. Spent from `system.stats.flux.value` before rolling.                         |
| Discipline          | `system.discipline`                                  | String key matching a Discipline item on the same actor.                                |
| Effect              | `system.ebbEffect`                                   | `damage` / `heal` / `effect`. Controls MOS bonus and apply behavior.                    |
| Target              | `system.ebbTarget`                                   | `enemy` / `ally` / `self`. Controls apply button visibility.                            |
| Wounds to Remove    | `system.removeWounds`                                | Integer 0–6. Wound locations cleared on success (fixed order: head, torso, arms, legs). |
| Heal/Wound Mode     | `system.ebbHealWoundMode`                            | Heal formulas only: `and` = single apply for both; `or` = separate actions.             |
| Damage / Min Damage | `system.damage`, `system.minDamage`                  | Roll formula and minimum damage floor.                                                  |
| AD                  | `system.ad`                                          | Armor Damage value passed to damage rolls.                                              |
| Attack Shape        | `system.formulaShape`                                | `ranged` (default) or `blast`. Controls which of the fields below the sheet shows.      |
| ROF / Recoil        | `system.rof`, `system.recoil`                        | Ranged-shape only.                                                                      |
| Range               | `system.range`                                       | Ranged-shape only.                                                                      |
| Blast Radius        | `system.blastRadiusInner`, `system.blastRadiusOuter` | Blast-shape only. Same convention as `SlaExplosiveData`.                                |

---

## Margin of Success (MOS)

The Skill Dice are compared against the Formula Rating. Each skill die that meets or exceeds the TN is a **success**.

### Damage formulas (ebbEffect = "damage")

The rulebook grants exactly **one** reward per skill-success tier — the bonuses are "fairly
different" and it is "not possible to downgrade to a lower bonus" — so the damage bonus does
**not** escalate at 3 and 4+ successes; those tiers grant the reuse and FLUX-regain rewards
described below instead of additional damage.

| Skill successes | Bonus                                         |
| --------------- | --------------------------------------------- |
| 0–1             | +0                                            |
| 2               | +1 damage                                     |
| 3               | +0 damage (see "MOS 3 — Reuse" below instead) |
| 4+              | +0 damage (see "Critical FLUX" below instead) |

Source: `module/helpers/ebb-mos.mjs → getEbbMosDamageBonus`

### Heal and effect formulas

MOS damage bonuses **do not apply** to heal or effect formulas. The skill success count still matters for Critical FLUX (see below).

### Success Through Experience

The rulebook states Success Through Experience (STE) does **not** apply to Ebb disciplines. The
code honors this: Ebb rolls resolve their base success via `computeSuccessDieOutcome`
(`module/sheets/actor/roll-math.mjs`), a separate path from the STE-aware
`calculateRollResult`/`getMOS` in `module/helpers/dice.mjs` used by weapon/skill rolls. A failed
Success Die on an Ebb roll is therefore never upgraded to a success, regardless of skill-success
count.

---

## Critical FLUX (MOS 4+)

When a formula roll **succeeds** and the caster achieves **4 or more skill successes**, the caster regains **1 FLUX** (capped at max). This applies to all formula types (damage, heal, effect).

The flux recovery is tracked on the `ChatMessage` via `flags.sla.ebbFluxRegainApplied`. If the GM later adjusts the TN or a Luck reroll changes the outcome, the flux point is automatically granted or revoked to stay consistent with the new result.

Source: `module/helpers/ebb-flux.mjs → syncEbbCriticalFlux`

---

## MOS 3 — Reuse

The rulebook grants a caster who lands **exactly 3 skill successes** on a successful roll the
option to recast the same Ebb Discipline ability again within 5 minutes, at **-3 Formula
Rating**. Since success requires `roll >= Formula Rating`, a -3 penalty to the target number is
mathematically equivalent to a **+3 bonus to the roll**, so this is implemented as a roll
modifier rather than a target-number change.

Rather than the system automatically tracking eligibility and the 5-minute window, every Ebb
Discipline cast opens a **pre-roll confirmation dialog** (`renderEbbCastDialog`) with a generic
**Situational Modifier** input. The player self-declares the modifier that applies to that roll —
e.g. `+3` for a MOS-3 reuse of an ability they rolled within the last 5 minutes, or a negative
value for an unrelated penalty (a house-ruled -2 for choking, for example). There is no automatic
flag, timer, or chat-card button: the player/GM is trusted to enter the correct value, the same
way other manual roll modifiers work in this codebase.

Source: `module/sheets/actor/ebb-rolls.mjs → renderEbbCastDialog`, `confirmEbbCast`,
`executeEbbRoll` (`situationalModifier` parameter)

---

## Formula Targets

The **Target** field controls where the result is applied:

| Target  | Behavior                                                                                                                                                                    |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enemy` | GM sees **Apply to target** button on the chat card.                                                                                                                        |
| `ally`  | GM sees **Apply to selected** button on the chat card.                                                                                                                      |
| `self`  | No apply buttons shown. Damage/heal (and optional wound removal) are applied directly to the **caster** immediately after the roll. The GM does not need to click anything. |

Self-target formulas that fail the roll do not auto-apply.

---

## Wound Removal

When **Wounds to Remove** is greater than 0 and the roll succeeds:

- **Damage formulas:** Wound removal is bundled with the damage apply (both happen on one GM button click).
- **Effect formulas (no HP change):** A **Remove wounds** button appears on the chat card. The target is the **selected** token (ally) or **targeted** token (enemy), following the formula's Target setting.
- **Heal formulas:** Behavior depends on **Heal/Wound Mode**:
    - `and` — Both HP healing and wound removal happen on a single **Apply** click.
    - `or` — A **Remove wounds** button appears alongside the heal button. Once one is used, the other is disabled for all connected clients (state stored on the chat message via `flags.sla.ebbHealWoundPathUsed`).

Wounds are cleared in a fixed anatomical order: **head → torso → left arm → right arm → left leg → right leg**. Only locations that are currently wounded are cleared; the count is consumed until exhausted.

---

## Embedded Active Effects on Formulas

The Ebb Formula item sheet has an **Effects** tab for authoring Foundry Active Effects directly on the formula. On a **successful** roll, the chat card shows GM-only buttons to apply those effects to the **targeted** or **selected** token, using the same visibility rules as damage apply buttons.

This enables formulas like buffs, debuffs, and status conditions without requiring a separate item.

---

## Disciplines

A **Discipline** item stores a rank that serves as the base for the dice pool. Formulas are linked to disciplines by name (the formula's `system.discipline` field matches the discipline item name, case-insensitive). Unlinked formulas use a dice pool of `1d10 + 1d10` (rank 0 fallback).

On the actor sheet, formulas are displayed nested beneath their parent discipline.

---

## Luck Rerolls on Ebb

The Luck dialog supports rerolling Ebb formula rolls. It reads the **Formula Rating (TN)** from the chat message's `flags.sla` payload (not a hardcoded TN), so adjusting the TN on the chat card and then spending Luck produces a correct recalculation.

---

## Developer Reference

### Key files

| File                                | Purpose                                                                                      |
| ----------------------------------- | -------------------------------------------------------------------------------------------- |
| `module/helpers/ebb-mos.mjs`        | `getEbbMosDamageBonus` — pure function for MOS damage bonus                                  |
| `module/helpers/ebb-flux.mjs`       | `syncEbbCriticalFlux` — flux regain/revoke on success/failure                                |
| `module/sheets/actor/ebb-rolls.mjs` | `renderEbbCastDialog`, `confirmEbbCast` — pre-roll situational-modifier dialog (MOS-3 reuse) |
| `module/helpers/items.mjs`          | `normalizeEbbEffect`, `normalizeEbbHealWoundMode` — canonical value normalization            |
| `module/helpers/chat.mjs`           | `SLAChat` — all chat card rendering and button handlers for Ebb                              |
| `module/data/item.mjs`              | `SlaEbbFormulaData`, `SlaDisciplineData` — schema definitions                                |
| `module/sheets/actor-sheet.mjs`     | Ebb roll initiation, flux deduction, roll result dispatch                                    |

### Chat message flags (`flags.sla`)

Key flags written to Ebb roll messages:

| Flag                        | Type                     | Purpose                                                  |
| --------------------------- | ------------------------ | -------------------------------------------------------- |
| `isEbb`                     | boolean                  | Identifies this as an Ebb roll                           |
| `ebbEffect`                 | string                   | Normalized effect type (`damage`/`heal`/`effect`)        |
| `ebbTarget`                 | string                   | `self`/`ally`/`enemy`                                    |
| `ebbFluxRegainApplied`      | boolean                  | Whether the critical flux +1 has been applied            |
| `ebbHealWoundMutualExclude` | boolean                  | Whether heal and wound removal are exclusive (`or` mode) |
| `ebbHealWoundPathUsed`      | `"heal"\|"wounds"\|null` | Which path was used in `or` mode                         |
| `tn`                        | number                   | Formula Rating used for the roll (read by Luck dialog)   |
| `removeWoundsCount`         | number                   | Wound locations to clear on the apply path               |
