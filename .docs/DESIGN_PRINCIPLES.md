# Design Principles

A short, opinionated set of rules for how this codebase is built — grounded in patterns and bugs
actually seen in this repo (see [LESSONS_LEARNED.md](LESSONS_LEARNED.md) for the incidents these
draw from), not generic best practice. Read alongside [DEVELOPER.md](DEVELOPER.md) (architecture)
and [CONTRIBUTING.md](../CONTRIBUTING.md) (workflow/style). When a change involves a real
tradeoff, these principles — not personal preference — are the tiebreaker.

Add a new principle here the same way LESSONS_LEARNED.md entries are added: only once a real
decision or bug has shown it's worth stating, with the evidence named.

---

## Code architecture

1. **Pure logic lives separate from Foundry glue.** Derived-data math, roll math, and validation
   helpers go in `-pure.mjs` files or dedicated modules (`roll-math.mjs`, `documents/derived/*.mjs`)
   with no `game`/`canvas`/`ChatMessage` calls, so they're unit-testable without a live instance.
   Orchestration (dialogs, chat cards, hooks) is a thin layer on top that calls into pure logic.

2. **Foundry's own lifecycle and APIs are the source of truth — don't reimplement them narrower.**
   The Active Effects bug (issue #359) came from hand-rolling a "sum Add rows" layer instead of
   calling/mirroring `Actor#applyActiveEffects`'s full 6-type semantics (Add/Subtract/Multiply/
   Downgrade/Upgrade/Override). When a Foundry system exists for something, use it or faithfully
   mirror its complete behavior — not a subset that happens to cover today's feature.

3. **One field, one meaning — don't overload an existing flag for a new, differently-scoped
   signal.** `equipped` means "worn/carried this scene," not "this specific attack was blocked" —
   that's why Shield Craft success is a separate, transient, per-hit chat-card checkbox instead of
   toggling `equipped`. When a new requirement doesn't fit an existing field's contract, add a new
   signal scoped to what it actually represents instead of stretching the old one.

4. **Centralize per-type side effects at the actor's descendant-document hooks, not at individual
   UI entry points.** `_onCreateDescendantDocuments`/`_onDeleteDescendantDocuments` catches every
   add path (drag-drop, sidebar create, compendium import, a macro's `createEmbeddedDocuments`)
   where a fix scoped to a single drop handler would not (see the Species/Trait effect-grant
   pattern in `documents/actor.mjs`).

5. **A "setter" helper that carries a side effect must be the only writer of that field.**
   `SlaItem#setEquipped()` persists `system.equipped` _and_ syncs Active Effects; before trusting
   that as the only path, grep for every other direct `update()`/`setProperty()`/creation-data
   write of the same field (issue #369's second regression: `actor-drops.mjs` wrote
   `system.equipped` directly and skipped the sync entirely).

## UI/UX conventions

6. **Shared dialog/sheet chrome, not one-off styling.** New dialogs reuse
   `.sla-dialog-window.dialog` plus a `flavor-*` class rather than inline styles; new sheet
   partials reuse existing shared partials (e.g. `stat-row.hbs`) rather than a hand-rolled
   duplicate — the Threat sheet's separate, hand-rolled stat table missing the AE-bonus hint
   (issue #377) is what happens when a second template drifts from the shared one.

7. **A control that can do nothing must say so, or not appear.** The Shield Craft checkbox with no
   label/tooltip (issue #356) read as a bug report, not a deliberate gate. Any conditional/gated
   control needs a visible reason at the point of use — a tooltip, a disabled state, or being
   hidden entirely when it can't apply to the current context.

8. **A derived or boosted value shown next to its base must be visibly distinguishable, not just
   correct underneath.** Same bug class as #377 (invisible AE bonus on the Threat sheet) and #390
   (a chat card total that was correct but unexplained): render a hint or a breakdown rather than
   a single opaque number whenever more than one modifier stacks into it.

## API & extensibility

9. **`game.sla` additions are documented in DEVELOPER.md in the same PR that adds them**, with
   parameters and behavior, not left to be inferred from source.

10. **New actor/item types and hooks follow the existing checklist exactly** (schema → registry →
    model-type-keys → sheet registration → template → tests — see "Common Tasks" in
    [DEVELOPER.md](DEVELOPER.md)) rather than skipping a step because "it's simple this time." Most
    of this repo's silent-failure bugs trace back to a checklist step skipped once.

## Process & tooling

11. **A green test that hand-builds its input is unverified until checked against the real
    producing path, schema, or runtime constant.** This is the single most repeated
    lessons-learned pattern in this repo (issue #348's `system.xxx` template bindings, the ghost
    `magazineId`/`dmg` fields, `CONST.ACTIVE_EFFECT_CHANGE_TYPES`'s actual shape misjudged twice).
    Prefer rendering the real template or calling the real producing API over a hand-built
    fixture; when you must hand-build one, verify its shape live before trusting it.

12. **Write a new mechanic's test expectations from the rulebook citation, not from the
    implementation's own output.** A test derived by re-reading your own code proves the code
    matches itself, not the rule — this is exactly how the shield AD-both-pools bug (issue #351)
    shipped in an RC with fully green tests.

13. **When a fix moves markup, renames a `data-*`/class, or relocates content, update every test
    that touches that structure in the same change.** This is the most-violated rule in this
    repo's history (see CLAUDE.md's own "Keep tests in sync with the code" section) — a test left
    behind doesn't fail loudly, it fails later looking like an unrelated regression.

14. **Every non-obvious bug class or footgun found this session gets a LESSONS_LEARNED.md entry
    before the session ends**, even when the session's main task was something else — concrete,
    evidenced by a file/commit/issue, and generalized into an actionable rule. This file only
    stays useful if every session that hits one of these adds to it.
