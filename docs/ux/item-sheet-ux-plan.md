# Item Sheet UX Plan

Issue: [#243 — General item UX pass](https://github.com/VacantFanatic/sla-foundry/issues/243)
Related: [#240 — Item sheet rework](https://github.com/VacantFanatic/sla-foundry/issues/240)
Target system version: `2.5.x` (Foundry v14.360)

> Status: **Proposal**. No production code is changed by this document. Each numbered phase below maps to its own atomic PR.

---

## 1. Goals

1. Give every item type a **distinct, recognisable visual identity** that still feels like one cohesive system.
2. Raise **scanability**: a GM should be able to glance at an open sheet and tell *what kind of thing* it is and *what its key numbers are* without reading labels.
3. Reduce **inline-style sprawl** and special-case CSS in `src/scss/sheets/_item.scss` so future tweaks aren't fragile.
4. Hit the explicit requests from #240 (image picker, "show to players", improved layout) without scope-creeping into mechanical changes.
5. Keep parity with existing Application V2 behaviour (drag-and-drop, ProseMirror flush, tab routing, scroll-layout binding, header artwork popout) — all current automation must continue to pass.

Non-goals:
- Adding new game mechanics or new system fields.
- Migrating the underlying `TypeDataModel` schemas.
- Re-doing actor sheets (separate work).

---

## 2. Audit of the current state

### 2.1 What we have today

The full inventory of item types and the part templates that render them:

| Type           | Template part                                  | Layout flavor         | Theme today                          |
| -------------- | ---------------------------------------------- | --------------------- | ------------------------------------ |
| `item`         | `item-catalogue.hbs`                           | single-view fallback  | Generic dark "store catalogue"       |
| `weapon`       | `item-weapon.hbs` (via catalogue)              | Details / Description | Dark + firing-mode grid              |
| `explosive`    | `item-explosive.hbs` (via catalogue)           | Details / Description | Dark + skill drop-zone               |
| `armor`        | `item-armor.hbs` (via catalogue)               | Details / Description | Dark + Powered Armor panel           |
| `magazine`     | `item-magazine.hbs` (via catalogue)            | single-view fallback  | Dark + weapon drop-zone              |
| `drug`         | `item-drug.hbs` (via catalogue)                | Details / Effects     | Dark + accent-coloured field labels  |
| `toxicant`     | `item-toxicant.hbs` (via catalogue)            | Details / Effects     | Dark + accent-coloured field labels  |
| `skill`        | `item-academic.hbs`                            | single-view           | "Academic paper" rows                |
| `trait`        | `item-academic.hbs`                            | single-view           | "Academic paper" rows                |
| `discipline`   | `item-spectral.hbs`                            | single-view (2-col)   | Purple Spectral, glow inputs         |
| `ebbFormula`   | `item-spectral.hbs`                            | Details / Desc / Eff. | Purple Spectral, glow inputs         |
| `species`      | `item-dossier.hbs`                             | single-view           | "Confidential dossier", stamp        |
| `package`      | `item-dossier.hbs`                             | single-view           | "Confidential dossier"               |
| `vehicle`      | `item-catalogue.hbs` (Item type, not Actor)    | single-view           | Plain dark — no real template        |

Header, tab-routing, scroll binding, ProseMirror flush, and drop-zone wiring all live in `module/sheets/item-sheet.mjs` and apply uniformly. Whatever we do visually has to plug into that pipeline (App V2 with `tag: "form"` and `PARTS.body.root: true`).

### 2.2 Pain points observed

These are concrete things to fix; each is referenced again in §5/§6 with the matching change.

1. **Visual identity is uneven.** Skills, traits, weapons, armor, explosives, magazines, drugs, toxicants, and the generic `item` type all share the same orange/dark "warehouse catalogue" look. Only Spectral (ebb/discipline) and Dossier (species/package) feel distinct. New users can't tell at a glance whether an open sheet is a weapon, a drug, or a magazine.
2. **Header is information-poor.** `templates/item/item-sheet-v2.hbs` shows portrait + name + a tiny localized type label, but no key stat (damage / capacity / PV / rank / cost) and no "type badge". The portrait is also flat with no theming hook beyond the static orange underline.
3. **Inline `style="…"` is everywhere.** `item-weapon.hbs`, `item-armor.hbs`, `item-drug.hbs`, `item-toxicant.hbs`, `item-effects.hbs`, `item-dossier.hbs` etc. embed colours, sizes, paddings, and grid templates. This makes accent colour changes hard (orange is hardcoded against `var(--sla-accent)` in places, and `#000`/`#777`/`#ccc`/`#ddd` in others) and prevents a clean per-type theme.
4. **Layout density is inconsistent.** `catalogue-grid` uses `1fr 1fr` regardless of how many fields exist, so weapons (lots of fields) and magazines (3 fields) waste space differently. Some fields force `grid-column: 1 / -1` inline, others don't.
5. **Two competing "panel" patterns.** `.sla-panel` + `.sla-header-bar` (used by weapon/armor/drug) versus `.paper-section` + `.paper-header` (used by dossier) versus ad-hoc `<div style="background:#000; …">` (drug/toxicant). They all do the same thing: a titled card. One should win.
6. **Catalogue inputs invert the theme.** `.item-catalogue .form-group` is hardcoded to `background:#ccc; color:#000;` (light), even though the rest of the sheet is dark. The result is a high-contrast wedge that fights the header and the description panel. This is the loudest readability issue.
7. **Description editor placement is inconsistent.** Tabbed sheets get a full-width `prose-mirror` in a Description tab; single-view sheets cram the editor below the attributes (`.sheet-description`) with a 100-px minimum that's frequently too short for species/package text.
8. **No "show to players" affordance from the sheet UI** (it exists as a header control via `showItemArtwork`, but only on the artwork). #240 calls out a context button for sharing the whole item.
9. **Magazine empty-state bug surface.** `_prepareSubmitData` already has a guard for `system.ammoType === ""`. The UI offers an unselectable empty option only because the `<select>` is rendered before defaulting; users can still see it flicker. Cosmetic but worth tidying with a default-selected option.
10. **Drop zones differ per item type without obvious reason.** Skill drop-zones (weapon/explosive) use `.skill-link-box`, package/species use `.skill-grant-area` (multi), ebb formulas use `.discipline-drop-zone`, magazines use `.weapon-link`. Same widget, four classnames, four CSS blocks.
11. **Accessibility gaps.** Header `<input>` for the name has no `aria-label`; many icon-only buttons (`.remove-skill-link`, `.delete-grant`, `.remove-discipline`) have a `title` but no `aria-label`; the firing-mode "enable" checkbox row uses colour-only to indicate active state; the catalogue grid's labels are uppercase `0.7em` which is below comfortable reading size.
12. **`#777` placeholder text on dark backgrounds is below WCAG AA contrast** in several spots (`Standard Weapon Rules`, `Systems Offline`, drug grid placeholders).

---

## 3. Design system additions

These primitives are the foundation everything else hangs off of. They're additive — no existing class is removed.

### 3.1 Per-type accent tokens

Add a sibling block to `src/scss/global/_variables.scss`:

```scss
:root {
    // Item type accents (hue per type, same lightness/saturation curve)
    --sla-item-weapon:     #c0392b; // crimson (kinetic)
    --sla-item-explosive:  #e67e22; // amber (ordnance)
    --sla-item-armor:      #4a7c8a; // steel-teal (protection)
    --sla-item-magazine:   #b08d57; // brass (ammo)
    --sla-item-drug:       #16a085; // pharma green
    --sla-item-toxicant:   #7fb800; // hazard chartreuse
    --sla-item-skill:      #6c8ebf; // service-card blue
    --sla-item-trait:      #9b59b6; // genome violet
    --sla-item-discipline: #8a2be2; // existing spectral purple
    --sla-item-ebbformula: #a855f7; // lighter spectral
    --sla-item-species:    #c0392b; // SLA red-stamp
    --sla-item-package:    #c0392b; // SLA red-stamp
    --sla-item-item:       var(--sla-accent); // fallback
}
```

A small SCSS map exposes them as classes:

```scss
$item-types: weapon explosive armor magazine drug toxicant skill trait
             discipline ebbFormula species package item;

@each $t in $item-types {
    .sla-item-root.#{$t}-theme,
    form.application.sla-industries.item.#{$t} {
        --sla-type-accent: var(--sla-item-#{to-lower-case($t)});
    }
}
```

After this, **every per-type rule references `var(--sla-type-accent)` instead of `--sla-accent` or hex values**. That alone lets us re-skin a type by editing one line.

### 3.2 Type icon registry

Map an existing Font Awesome glyph to each type (no new assets needed):

```js
// module/config.mjs
export const ITEM_TYPE_ICONS = {
    weapon:     "fa-solid fa-gun",
    explosive:  "fa-solid fa-burst",
    armor:      "fa-solid fa-shield-halved",
    magazine:   "fa-solid fa-bullseye",
    drug:       "fa-solid fa-syringe",
    toxicant:   "fa-solid fa-biohazard",
    skill:      "fa-solid fa-graduation-cap",
    trait:      "fa-solid fa-dna",
    discipline: "fa-solid fa-eye",
    ebbFormula: "fa-solid fa-wand-sparkles",
    species:    "fa-solid fa-id-card",
    package:    "fa-solid fa-folder-open",
    item:       "fa-solid fa-box",
    vehicle:    "fa-solid fa-car"
};
```

Exposed in `_prepareContext` so headers can render `<i class="{{typeIcon}}"></i>` without per-template `{{#if}}` chains.

### 3.3 One panel primitive

Collapse `.sla-panel`/`.sla-header-bar`, `.paper-section`/`.paper-header`, and the inline `style="background:#000"` blocks into a single primitive:

```hbs
{{!-- templates/item/parts/_panel.hbs --}}
<section class="sla-card{{#if accent}} sla-card--accent{{/if}}{{#if compact}} sla-card--compact{{/if}}">
    {{#if title}}
    <header class="sla-card__header">
        {{#if icon}}<i class="{{icon}}"></i>{{/if}}
        <h3 class="sla-card__title">{{title}}</h3>
        {{#if action}}<span class="sla-card__action">{{{action}}}</span>{{/if}}
    </header>
    {{/if}}
    <div class="sla-card__body">{{> @partial-block}}</div>
</section>
```

CSS uses `--sla-type-accent` for the border-left rail, so the same component automatically inherits each type's theme. Legacy classes get a thin compatibility shim while parts are migrated.

### 3.4 One drop-zone primitive

Unify `.drop-zone.skill-link-box`, `.weapon-link`, `.discipline-drop-zone`, `.skill-grant-area` behind:

```hbs
{{!-- templates/item/parts/_drop-zone.hbs --}}
<div class="sla-drop {{#if filled}}sla-drop--filled{{/if}}"
     data-zone="{{zone}}"
     {{#if accept}}data-accept="{{accept}}"{{/if}}>
    {{#if filled}}
    <div class="sla-drop__token">
        {{#if img}}<img src="{{img}}" alt="" />{{/if}}
        <span class="sla-drop__name">{{name}}</span>
        {{#if removeAction}}
        <button type="button" class="sla-drop__remove" data-action="{{removeAction}}"
                aria-label="{{removeLabel}}" title="{{removeLabel}}">
            <i class="fas fa-times"></i>
        </button>
        {{/if}}
    </div>
    {{else}}
    <span class="sla-drop__placeholder">{{placeholder}}</span>
    {{/if}}
</div>
```

The existing JS drop handlers continue to bind by `data-zone` rather than the legacy class. Each handler keeps its current contract; the alias selectors stay in place for one release cycle.

### 3.5 Header redesign (universal)

Today's header is portrait + name + 1 line type label. The proposal extends to a strip:

```
┌──────────────────────────────────────────────────────────────┐
│ [img]  Name…………………………………………………………  [type-pill]              │
│        [stat-chip] [stat-chip] [stat-chip]   [card actions] │
└──────────────────────────────────────────────────────────────┘
```

- `[type-pill]` = `<i class="{{typeIcon}}"></i> {{localize "TYPES.Item.<type>"}}` on a `var(--sla-type-accent)` background.
- `[stat-chip]` row is **per type** and read-only. Examples below. It surfaces the 2–4 most important numbers right next to the name so the user doesn't have to scroll the body to identify the item.
- `[card actions]` group: existing artwork popout, plus a **Show to Players** button (closes #240's request), and (when on an owned item) **Send to chat**.

The header markup becomes one template (`templates/item/parts/_header.hbs`); each type just supplies a `headerStats` array via the sheet's `_prepareContext`.

---

## 4. Per-type visual identity

For each type we define: **accent**, **icon**, **header stat-chips**, **body layout**, **theme cue**. The accent token already drives borders / focus rings / link colours via §3.1.

### 4.1 Weapon — *Crimson kinetic*
- Accent: `--sla-item-weapon` (`#c0392b`).
- Icon: `fa-gun`.
- Header stats: **Dmg**, **AD**, **Range**, **Attack type** (melee/ranged badge).
- Body: two-column `Stats | Linked skill` card; firing-mode table only when `attackType === "ranged"`; Powersuit panel collapsible (`<details>` with persistent state via `system.powersuitAttack`).
- Cue: thin "munition" stripe along the left edge of the body using the accent token (`border-left: 3px solid var(--sla-type-accent)`).
- Fixes: 4.2, 4.4, 4.10, 4.12 from §2.2.

### 4.2 Explosive — *Amber ordnance*
- Accent: `--sla-item-explosive`.
- Icon: `fa-burst`.
- Header stats: **Dmg**, **AD**, **Kill / Max blast** (single chip `"3 / 5 m"`).
- Body: two-column compact card; uses the unified drop-zone for required skill.
- Cue: pulsing accent dot beside the icon (CSS only, `prefers-reduced-motion` respected) to differentiate from weapons at a glance.

### 4.3 Armor — *Steel teal*
- Accent: `--sla-item-armor`.
- Icon: `fa-shield-halved`.
- Header stats: **PV**, **Resist (cur/max)** as a progress chip, **Powered** badge when active.
- Body: top card with PV/Resist; Powered Armor card collapsible with a clearer "Systems Offline / Online" indicator (icon + colour, not just italic grey text → fixes A11y #12).
- Cue: hex-tile background pattern (very subtle `radial-gradient` mask) behind the body header.

### 4.4 Magazine — *Brass ammo*
- Accent: `--sla-item-magazine`.
- Icon: `fa-bullseye`.
- Header stats: **Cap**, **Ammo type**, **Linked weapon** (or "—").
- Body: 3 rows, compact; ammo type `<select>` now has a default-selected placeholder option that submits as `"std"` directly (kills the `_prepareSubmitData` coercion path's necessity, though we keep it as a safety net). Linked-weapon uses the unified drop-zone.
- Single-view (no tabs) — description sits below.

### 4.5 Drug — *Pharma green*
- Accent: `--sla-item-drug`.
- Icon: `fa-syringe`.
- Header stats: **Addiction**, **Duration**, **Cost**.
- Body retains the existing two-column "generic stats | drug specifics" split, but inline `style="background:#000"` is replaced by a `.sla-card` with the green accent rail. Field labels switch from `var(--sla-accent)` (orange) to `var(--sla-type-accent)` for cohesion.
- Effects tab unchanged.

### 4.6 Toxicant — *Hazard chartreuse*
- Accent: `--sla-item-toxicant`.
- Icon: `fa-biohazard`.
- Header stats: **IR**, **Treatment**, **Vector** (text-truncated).
- Body: same `.sla-card` primitive; the existing "Exposure uses Success Die + STR vs IR" footer is moved into a small `.sla-help-bar` so the hint text isn't competing visually with the field labels.

### 4.7 Skill — *Service-card blue*
- Accent: `--sla-item-skill`.
- Icon: `fa-graduation-cap`.
- Header stats: **Rank**, **Stat**, **XP**.
- Body: keep the academic-paper feel but raise the field font-size to 1em and the label colour to AA contrast. Convert `<input type="number">` for rank into a small stepper card. **Default sheet height drops to ~360 px** since the body is tiny.

### 4.8 Trait — *Genome violet*
- Accent: `--sla-item-trait`.
- Icon: `fa-dna`.
- Same body as skill, with a free-text **Type** field rendered as a chip-input. Differentiated from skill by accent + icon only.

### 4.9 Discipline — *Spectral purple*
- Accent: `--sla-item-discipline` (existing `#8a2be2`).
- Icon: `fa-eye`.
- Header stats: **Rank**.
- Body: keep current 2-column (rank card | description). Migrate from `.spectral-discipline-card` to `.sla-card` so the look survives a future global tweak.

### 4.10 Ebb Formula — *Spectral magenta*
- Accent: `--sla-item-ebbformula`.
- Icon: `fa-wand-sparkles`.
- Header stats: **Rating**, **Cost** (Flux), **Effect** badge, **Target** badge.
- Body: the existing `.spectral-ebb-card` becomes three stacked `.sla-card`s: **Casting** (rating/cost/range), **Resolution** (target/effect/wounds/heal-mode), **Combat** (damage/min/range). The required-discipline drop-zone gets a coloured "rune" frame via the unified drop-zone primitive.
- Effects tab unchanged.

### 4.11 Species — *SLA-red dossier*
- Accent: `--sla-item-species` (red-stamp).
- Icon: `fa-id-card`.
- Header stats: **Base HP**, **Move (Close/Rush)**, optional Luck/Flux baselines if present.
- Body: keep the `office-dossier` flavour, but `.dossier-stamp` becomes a corner badge instead of a rotated block taking 80 px of vertical space. Stat-limits grid switches from 2-col to a `repeat(auto-fit, minmax(120px, 1fr))` so it adapts to width. Granted-skills area becomes a labelled `.sla-drop` with chips.
- Sheet height: bigger by default (~720) since species sheets contain the most fields.

### 4.12 Package — *SLA-red dossier (variant)*
- Same dossier theme as Species but icon `fa-folder-open` to distinguish.
- Header stats: **Granted skills count**, **Requirements summary** (e.g. `STR 4 / DEX 6`).

### 4.13 Generic Item & Vehicle (Item type)
- Accent: fallback `--sla-accent`.
- Icon: `fa-box` / `fa-car`.
- Header stats: **Weight**, **Cost**, **Qty**.
- Body: catalogue grid with the **light wedge fixed** (issue 2.2#6): `.item-catalogue .form-group` becomes a dark surface with light labels, same contrast as the rest of the sheet. The legacy class is kept so old worlds' custom CSS still resolves.

---

## 5. Cross-cutting readability & usability fixes

These apply to every type and are not optional.

| # | Issue (§2.2 ref)                              | Fix |
|---|-----------------------------------------------|-----|
| 5.1 | #6 light catalogue wedge                    | Move `.item-catalogue` to a dark surface with `var(--sla-text-light)` and a 1px hairline border, using the type accent for the input bottom-border on focus. |
| 5.2 | #4 layout density                            | Replace the fixed `catalogue-grid 1fr 1fr` with `repeat(auto-fit, minmax(140px, 1fr))`. Type-specific grids use named CSS grid areas (`stats stats / skill skill`) per template. |
| 5.3 | #3 inline styles                             | Strip every `style="…"` in `templates/item/parts/*.hbs`; replace with utility classes (`.sla-row`, `.sla-stack`, `.sla-grid-2`, `.sla-grid-auto`, `.sla-card`). Inline styles forbidden going forward (lint via a small `npm run check:inline-styles` script). |
| 5.4 | #5 panel patterns                            | One primitive (`.sla-card`); deprecate `.sla-panel`, `.paper-section`. Keep selectors aliased for one release. |
| 5.5 | #10 drop-zone fragmentation                  | One primitive (`.sla-drop`); JS handlers re-bound by `data-zone` instead of legacy class. |
| 5.6 | #11 a11y — buttons                           | All icon-only buttons add `aria-label`. Header name input gets `aria-label="Item name"`. Drop-zones get `role="region"` + `aria-label`. |
| 5.7 | #11 a11y — colour-only state                 | Firing-mode `.enabled` row adds a leading dot icon + `aria-pressed` on the checkbox; powered-armor "Online" state gets a green check icon. |
| 5.8 | #12 contrast                                  | Replace `#777`/`#888` muted greys with `var(--sla-text-muted)` (`#a8a8b0` on dark) — passes AA at 12 px. Define `--sla-text-muted` alongside existing tokens. |
| 5.9 | #7 description inconsistency                 | Description editor always lives in its own tab. Single-view types adopt the 2-tab layout (`Details`, `Description`) so the editor is never squished. Skill/trait keep their micro-form because there's nothing else to tab to (they get a description block under the form, no tab). |
| 5.10 | #2 header info-poor / #8 share              | Universal header (§3.5) adds stat chips, type pill, and a "Show to Players" header control (uses Foundry's existing `ChatMessage.create({ content: item.link })` pattern) — closes the explicit #240 ask. |
| 5.11 | #9 magazine empty `ammoType`                | Render the `<select>` with `selected="std"` by default; keep the submit-side coercion as a defensive guard. |
| 5.12 | Density / responsive                         | Sheets become resizable to ~420 px wide minimum with cards re-flowing to single column under 480 px (already partially done for discipline). |
| 5.13 | "Show to player" context button               | Header control + a sheet-level "Share" action accessible via the same context menu Foundry uses elsewhere (`_getHeaderControls()` already overridden for artwork — extend it). |
| 5.14 | Image picker affordance                       | Hover state on `.profile-img` shows a pencil overlay (CSS only) — discoverability fix. Picker wiring already exists in `#openItemImagePicker`. |

---

## 6. Implementation phases

Each phase is a self-contained PR that builds on the previous one. Every PR ships `npm run build` (SCSS → `css/sla-industries.css`), `npm run test:unit`, and updates `CHANGELOG.md`'s `[Unreleased]` section. No phase forces a save-file migration.

### Phase 0 — Visual regression baseline (preparatory PR)
- Add Playwright screenshot tests under `tests/e2e/regression/item-sheets-visual.spec.js` that open one item of each type in the existing `sla-test-world` and snapshot the sheet at the default size.
- These snapshots are the diff target for every subsequent phase.
- **Touches:** `tests/e2e/regression/`, no production code.
- **Risk:** low. Requires Foundry secrets in cloud, but tests are skipped gracefully when `FOUNDRY_URL` is unreachable.

### Phase 1 — Tokens & primitives (no behaviour change)
- Add `--sla-type-accent`, `--sla-item-*`, `--sla-text-muted` to `src/scss/global/_variables.scss`.
- Add `ITEM_TYPE_ICONS` to `module/config.mjs` and expose `typeIcon` from `_prepareContext`.
- Add `.sla-card`, `.sla-drop`, `.sla-row`, `.sla-stack`, `.sla-grid-auto` utility classes (`src/scss/components/_card.scss`, `_drop.scss`, `_layout.scss`).
- **Touches:** SCSS, `module/config.mjs`, `module/sheets/item-sheet.mjs`.
- **Visual delta:** zero. Snapshots from Phase 0 unchanged.

### Phase 2 — Universal header refresh
- Replace the inline header block in `templates/item/item-sheet-v2.hbs` with `templates/item/parts/_header.hbs`.
- Header surfaces `typeIcon`, `typePill`, `headerStats[]`, "Show to Players" header control.
- `headerStats` defaults to `[]`; per-type sheets fill it in §4 order.
- **Risk:** medium. Header is the most-rendered block. Snapshot diffs expected — accept them.

### Phase 3 — Catalogue dark-mode + grid responsiveness (the loudest fix)
- Rewrite `.item-catalogue` + `.catalogue-grid` rules to dark surface + `auto-fit` grid.
- Strip inline styles from `item-weapon.hbs`, `item-armor.hbs`, `item-explosive.hbs`, `item-magazine.hbs`, `item-drug.hbs`, `item-toxicant.hbs`. Move all spacing to utility classes.
- No type-accent yet — phase 4 layers that on top.
- **Risk:** medium. Highest visual-diff impact, but mechanically inert.

### Phase 4 — Per-type accents & icons (4.1–4.13)
- Drive borders, focus rings, drop-zone hue from `var(--sla-type-accent)`.
- Add icons + type pill rendering.
- Keep the spectral-purple and dossier-red exactly where they already are (just sourced from the token).

### Phase 5 — Panel & drop-zone unification
- Migrate `.sla-panel`, `.paper-section`, `.spectral-ebb-card`, `.spectral-discipline-card` to `.sla-card`. Aliases stay for one minor release.
- Migrate `.skill-link-box`, `.weapon-link`, `.discipline-drop-zone`, `.skill-grant-area` to `.sla-drop`; JS handlers re-bound by `data-zone`.
- **Risk:** medium-high — drop-zone handler wiring is what makes the sheets useful. Cover with Playwright drops in `tests/e2e/regression/`.

### Phase 6 — Accessibility & contrast pass (§5.6–5.8)
- `aria-label`s on icon buttons, name input, drop zones.
- Replace muted greys with `--sla-text-muted`.
- Firing-mode and Powered Armor status get icon + colour, not colour-only.
- **Risk:** low.

### Phase 7 — Layout polish & per-type chrome (§5.9, §5.12, §5.14)
- Tabs vs single-view normalised (§5.9).
- Responsive collapse at ≤ 480 px.
- Hover pencil on portrait.
- Type-specific micro-touches: hex pattern for armor, rune frame for ebb formulas, dossier corner stamp, etc.
- **Risk:** low.

### Phase 8 — Documentation, release notes, screenshots
- Update `item_setup.md` screenshots and `DEVELOPER.md` design-token section.
- `CHANGELOG.md` `[Unreleased]` collected into the next minor release (`2.6.0` — UI uplift, no API break).

---

## 7. Risks & open questions

1. **Foundry App V2 quirks.** `PARTS.body.root: true` plus `tag: "form"` already causes the form to hoist over the template root (see `_bindItemSheetScrollLayout` in `module/sheets/item-sheet.mjs`). Anything we add to the header must work whether `.sla-item-root` lives on the form element or under it. The new `_header.hbs` partial must duplicate selector chains the same way the existing CSS does (and tests in Phase 0 lock that in).
2. **ProseMirror reflow.** Phase 5 moves description into a tab for every type. We must keep `#flushDescriptionProseMirrorIfNeeded` working when the tab is hidden at submit time (Foundry's pipeline already handles hidden form fields, but the manual flush in `_preClose` is what currently saves the dirty editor — we must continue to call it).
3. **Drop-handler regression.** Reclassing the drop-zones forces a JS change in `module/sheets/item-sheet.mjs` (`#onRender` selector list). One Playwright spec per zone is non-negotiable for phase 5.
4. **Compendium content.** Existing pack items (skills, traits, species, disciplines, vehicles, quick-start-gear) carry their `img`. None of the schema changes; visual identity comes from the type, not from per-item flags. No `migration.mjs` work required.
5. **Custom user CSS.** Some users override `.sla-panel` / `.paper-section`. We keep these selectors aliased to `.sla-card` for one release cycle and call it out in the changelog.
6. **Localisation.** The per-type pill text already comes from `TYPES.Item.<type>`. New labels (e.g. "Show to Players", "Online", "Offline") go in `lang/en.json` and `lang/fr.json`. Phase 2 owns these.
7. **Foundry version drift.** Verified against `14.360`. Header controls API and `ImagePopout` import path are stable in v14; if v15 ships before we land, Phase 2's header control wiring will need re-verification.

---

## 8. Acceptance criteria

A maintainer should be able to verify the finished work by:

1. Opening one of each item type in `sla-test-world` and seeing:
   - A type-distinctive accent colour and icon.
   - 2–4 read-only stat chips next to the name.
   - A consistent "Show to Players" header control.
   - No inline `style="…"` on the rendered DOM.
2. Running `npm run test:unit` and `npm run test:e2e:regression` cleanly.
3. Playwright snapshots from Phase 0 update only on phases that intend visual change (2, 3, 4, 5, 7).
4. WCAG AA contrast on every visible text node on the default theme (spot-check via the Lighthouse contrast pass on the screenshots from #8.3).
5. Toggling Foundry's "Reduce Motion" disables the explosive accent pulse and any other animation added in phase 7.
6. `CHANGELOG.md` `[Unreleased]` section lists every user-visible change, grouped by Added / Changed / Fixed.
