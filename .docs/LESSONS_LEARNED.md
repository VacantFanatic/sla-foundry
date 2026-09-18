# Lessons learned

Non-obvious lessons discovered during past sessions — bug classes, testing pitfalls, footguns in
this codebase or in Foundry's API. Read this before making non-trivial changes (see
[CLAUDE.md](../CLAUDE.md) → "Before starting work").

When you discover a new one, add it here before ending your turn, in the same style as the
entries below: concrete, evidenced by a specific file/commit, and generalized into an actionable
rule for next time. Do this even if the session's main task was something else — this file is
only useful if it stays current.

- **A template `name="system.xxx"` binding that doesn't match the schema fails silently, and it
  can happen more than once.** Issue #348: `templates/actor/parts/header-card.hbs`'s LAD checkbox
  was bound to `name="system.bio.lad"` / `{{checked system.bio.lad}}`, but `SlaCharacterData`
  (`module/data/actor.mjs`) only ever declared `bio.ladAccount` — `system.bio.lad` was never a
  real field. `git log -p` on the template shows the same wrong binding was re-added multiple
  times under a comment literally reading "Bottom Bar (LAD Checkbox Restored)", because nothing
  ever pointed out the field didn't exist: `TypeDataModel` drops unknown submitted keys with no
  error, so the checkbox just silently never persisted, and _any_ re-render (the Edit/Play mode
  toggle's `this.render(false)` in this case) exposed the always-empty result — the bug looked
  like a mode-toggle problem but had nothing to do with mode toggling. Writing a test scan for
  every `name="system...."` binding across `templates/` (see
  `tests/unit/form-field-schema-conformance.test.mjs`) immediately turned up four more live
  instances of the exact same mistake in unrelated files (`system.finance.debt` on the character
  sheet, `system.quantity` on armor/weapon item sheets, `system.typeNote` on the generic item
  sheet) — all fixed by adding the missing schema field, following the same pattern as sibling
  fields/types that already declared it correctly. A single field fix (or a single regression
  test for that one field) doesn't guard against this bug class recurring elsewhere; a generic
  scan across every template does, and paid for itself immediately.
- **A field referenced in code is not necessarily part of the data model.** The ammo
  modifier system (`weapon-gates-pure.mjs`) was built around `item.system.magazineId` on
  weapons, but `SlaWeaponData` (`module/data/item.mjs`) never declared that field in its
  schema — Foundry `TypeDataModel`s silently drop undeclared properties, so nothing ever
  persisted it, and no amount of unit-testing the consuming logic caught this. Before
  trusting `item.system.<field>` anywhere, confirm it's actually declared in the relevant
  `defineSchema()` in `module/data/item.mjs`.
- **Test the full data lifecycle, not just the logic that consumes a value.** Pure-function
  tests for the ammo modifier getters were thorough and all passed, but nothing ever tested
  that the Reload flow (`reload.mjs`) actually produces the value those getters read. A
  feature can be 100% correct and covered where you're looking and still be completely
  unreachable in practice because the upstream step that feeds it was never wired up. When
  a fix depends on another part of the system producing a value, add (or at least manually
  trace) coverage for that producing step too, not only the consuming step.
- **A test that hand-constructs its input can validate the wrong shape entirely.** The first
  fix for Active Effect ADD-mode detection (commit `39e7fd9`) added tests and passed them,
  but every test — unit and E2E — hand-built change rows using a numeric `mode`, including
  one that assigned `mode: CONST.ACTIVE_EFFECT_CHANGE_TYPES.add` assuming that constant was
  numeric. It isn't: Foundry v14 renamed the canonical field from `mode` (number) to `type`
  (a plain lowercase string — see the corrected claim and the issue #359 entry below for what
  that constant actually contains), and the E2E test's constant access was even wrong-cased
  (`.add` vs. the uppercase `.ADD` this fix mistakenly assumed existed), so it silently
  exercised `mode: undefined` instead of the v14 path it claimed to cover. The fix "worked"
  against its own tests while leaving the real-world bug (#330) completely unfixed. When a
  test constructs a data shape by hand instead of using the real producing API/UI, verify
  that shape against the actual runtime's current schema/constants before trusting it — a
  green test suite only proves the code satisfies its own tests, not that the tests match
  reality. **Correction (issue #359 session):** the parenthetical above originally claimed
  `CONST.ACTIVE_EFFECT_CHANGE_TYPES.ADD === "add"` — confirmed live against a running Foundry
  v14.367 instance that this is false. See the dedicated entry below for the real shape; this
  wrong claim is exactly what caused the #359 fix to initially ship with the same class of bug
  before live verification caught it.
- **A test mock that doesn't reference the real schema can drift from it silently.**
  `tests/unit/roll-math.test.mjs`'s `buildEbbDamageFormula` tests mocked
  `item.system.dmg` — a field never declared on `SlaEbbFormulaData` (the real field is
  `damage`) — and only passed because of a dead `item.system.dmg || item.system.damage`
  fallback in `roll-math.mjs`/`weapon-gates.mjs`/`weapon-rolls.mjs`. Removing that fallback
  (itself flagged because `dmg` was never declared anywhere) broke the test, which is what
  surfaced the mismatch. A green test that only passes because of a dead code path is a
  sign the test's input shape is wrong, not that the dead path is safe to keep — when
  deleting a fallback or branch believed unreachable, re-run the full suite and treat any
  resulting failure as a bug in the test, not a reason to keep the fallback.
- **Not all Foundry state is per-test.** Actors and items created in a test are cleanly
  scoped (create, assert, delete), but world settings (`game.settings.get`/`set`),
  `game.user.hotbar`, and world-level Macros are shared, persistent state — a test that
  flips a setting or assigns a hotbar slot without restoring/clearing it afterward leaks
  into every later test and into the GM's real session. Capture the original value before
  changing shared state and restore it in the same test (see the `applyRangedModifiers` and
  `executeEbbRoll` E2E specs), and delete any Macro or clear any hotbar slot a test creates.
- **Don't fake canvas/token state you can't verify against a live Foundry instance.**
  Functions that read `game.user.targets` or `canvas.tokens.controlled` (target/token-
  dependent gating, range checks) can't be safely tested by constructing fake Set-like
  objects without a running instance to confirm the override actually works. Prefer testing
  the real default (no target/token selected — often the only state reachable without a
  placed scene token anyway) and leave the token-present branch as a documented gap rather
  than guessing at an internal API shape; `canvas.grid`, by contrast, is safe to
  temporarily overwrite wholesale for a deterministic distance stub since it's a plain
  object property, not a derived/live collection.
- **A shared accessibility helper only fixes the markup it's given — copy/pasted templates
  can apply it inconsistently and nothing will flag the gap.** `actor-sheet.mjs`'s
  `#syncTabAccessibility` (queries `nav.sheet-tabs [role="tab"]` and syncs
  `aria-selected`/`tabindex`) works correctly, but `actor-npc-sheet-v2.hbs` only gave the
  `combat` tab the full `id`/`role="tab"`/`aria-controls` markup the character sheet gives
  every tab — the other four NPC tabs (`inventory`, `effects`, `skills`, `notes`) had no
  `role="tab"` at all, so the shared JS silently skipped them every render. The one existing
  aria E2E assertion (`regression-actor-sheets.spec.js`) only ever exercised the character
  sheet, so this went unnoticed. When a JS helper is written against a markup contract
  (`[role="tab"]`, a specific `id` naming scheme), audit every template that's supposed to
  satisfy that contract, not just the one the helper was originally built for — and add an
  aria assertion per sheet type, not just one for the "primary" sheet.
- **A weapon-attack code path can be gated behind a world setting, not just canvas state.**
  `renderAttackDialog`/`processWeaponRoll` (`weapon-rolls.mjs`) call
  `canProceedWithWeaponAttack(sheet, item, { requireTarget: true })`, which blocks on
  `game.user.targets.size === 0` only when the `enableTargetRequiredFeatures` world setting
  is on — and it defaults to on. E2E specs for the Attack dialog therefore don't need a
  placed scene token/target at all (which the canvas-state lesson above warns against
  faking); temporarily setting that world setting to `false` for the test (capturing and
  restoring it per the shared-state lesson above) reaches the melee attack path with zero
  canvas setup. Before assuming a gated flow requires unreliable canvas/token state, check
  whether the gate is actually a `game.settings.get(...)` world setting instead.
- **`devices['Desktop Chrome']` in `playwright.config.js` silently overrides the top-level
  `use.viewport`, and "fixing" that to the documented 1920x1080 can destabilize the whole suite
  in a GPU-less sandbox.** `playwright.config.js`'s top-level `use` declares
  `viewport: { width: 1920, height: 1080 }`, but the `chromium` project's `use: { ...devices['Desktop
Chrome'] }` spreads in that device preset's own `viewport: { width: 1280, height: 720 }` —
  project-level `use` wins the merge, so every E2E test has actually always run at 1280x720, not
  1920x1080. This is real and reproducible (confirmed via a live `page.evaluate(() =>
window.innerWidth)` inside a running test), and it explains genuine "element is outside of the
  viewport" failures for UI docked near the right edge (e.g. the chat sidebar's per-message action
  buttons in `regression-dialogs.spec.js`'s Luck dialog test). The instinctive fix — re-asserting
  `viewport: { width: 1920, height: 1080 }` in the project's `use` to match the documented intent —
  is _not_ safe to apply blindly: in this sandbox's software-rendered, GPU-less headless Chromium
  (`--use-angle=swiftshader-webgl`), doubling the rendered pixel count reproducibly broke the
  _entire_ suite (two independent clean `nohup`-backgrounded runs both went from 7-9/10 passing to
  3/10, with page/browser crashes and "element was detached from the DOM" errors), while reverting
  the viewport back to the accidental 1280x720 immediately restored full stability. When an element
  is genuinely visible but sits outside whatever viewport is in effect, prefer a viewport-independent
  fix — `await locator.evaluate((el) => el.click())` dispatches a real DOM `click` event without
  requiring on-screen mouse coordinates — over widening the viewport to chase it; don't assume a
  config value documented as "intended" is safe to actually apply without testing for exactly this
  kind of environment-specific regression first. **Update, same investigation:** the accidental
  1280x720 isn't just a Playwright-actionability quirk — it's genuinely below Foundry's own
  minimum supported resolution, so Foundry displays a persistent "screen resolution too small"
  warning toast that intercepts pointer events for anything behind it. This directly broke
  `regression-sla.spec.js`'s Settings test (clicking into the settings config app hung at
  1280x720) — not a stale selector as first suspected. Scoping `test.use({ viewport: { width:
  1920, height: 1080 } })` to just that one test _did_ make the warning go away, but it also
  reproduced the same rendering flakiness the paragraph above warns about (two separate runs of
  the identical scoped-viewport test gave different, non-deterministic results — one found every
  setting label instantly, the next couldn't find even the first one after 15s), so it's not a
  safe fix either, even scoped to a single test. The warning toast renders into `#notifications` —
  the exact container `dismissFoundryNotifications()` already knows how to clear — and can
  reappear after the initial dismissal; re-calling `dismissFoundryNotifications(page)` immediately
  before the click it was blocking fixed it reliably (confirmed clean twice in a row) at the
  ordinary, stable 1280x720 viewport, no viewport change needed at all. When something a viewport-
  driven Foundry warning is blocking, look for a way to dismiss the warning itself before reaching
  for a bigger viewport — this sandbox's software rendering makes viewport size itself the least
  reliable lever to pull. **Update, later session:** that instability was specific to the full jump
  to 1920x1080 (a ~2.25x increase in rendered pixels), not to changing the viewport at all. Raising
  it only to Foundry's own documented minimum (1366x768, a ~1.13x increase — enough to clear the
  "screen resolution too small" warning permanently, not just paper over one blocked click) was
  confirmed safe: 23 UI-heavy tests across `regression-accessibility`, `regression-actor-sheets`,
  and `regression-dialogs` ran back-to-back with zero failures, and the warning was confirmed gone
  via direct console capture. `playwright.config.js` now sets `1366x768` in both the top-level
  `use.viewport` and (since the `chromium` project's `devices['Desktop Chrome']` spread still wins
  the merge) the project's own `use.viewport`. The dismiss-the-warning workaround above is still the
  right call for one-off blocked clicks discovered mid-session, but for the suite as a whole, a
  small, deliberately-sized viewport bump is a legitimate fix — don't assume all viewport changes
  are equally risky just because one large one was.
- **A "derive X from Y on every render" line can silently overwrite a manually-toggled status
  that's supposed to be independently clearable.** `SlaActor._calculateWounds()` computed the
  displayed `system.conditions.stunned` two ways: first from the real Stunned Active Effect
  (`hasEffect('stunned')`, correct), then unconditionally forced back to `true` whenever
  `wounds.head === true` (`if (logic.stunned) system.conditions.stunned = true;`) — on _every_
  `prepareDerivedData()` call, not just when a wound changed. The Stunned icon in
  `wounds.hbs` is a manual `condition-toggle` (clicking it calls `actor.toggleStatusEffect('stunned')`
  directly, bypassing `_onUpdate` entirely) specifically so a GM can clear it independently of the
  wound per the rulebook (Stunned clears via rest/drugs/medical intervention; the wound itself only
  heals via medical intervention) — but the forced re-derivation clobbered that clear on the very
  next render, since the head wound was still marked. A second, related bug lived in
  `_handleWoundEffects()` (the method that actually adds/removes the Active Effect from
  `_onUpdate`): it re-evaluated `wounds.head` on _any_ wound field changing, not just `head`
  itself, so editing an unrelated wound (e.g. a leg) would silently resurrect a Stunned effect a GM
  had just removed. Fixed by (1) deleting the forced-override line so the displayed condition
  always mirrors the real effect state, and (2) gating the Active-Effect sync in
  `_handleWoundEffects` on the specific field (`head`) having changed, not "some wound changed"
  (see `resolveStunnedFromHeadWound()` in `derived/wounds.mjs`). When a UI exposes a manual
  toggle for a value that's _also_ auto-derived elsewhere, check every place that writes the
  derived value for an unconditional re-assignment that would fight the manual toggle — this
  kind of line is much easier to miss during review than a state-machine transition would be,
  precisely because it looks like a harmless "keep it in sync" default rather than a bug.
- **Don't assume a single "equipped" boolean can gate both "is this item in use this scene" and
  "did this item's effect apply to this specific event."** While building Shield support (#351),
  the natural first instinct was to gate a shield's per-attack PV/resistance contribution on its
  `equipped` flag alone — but `equipped` already means "worn/carried right now" (it also drives
  weight/encumbrance via `computeCarriedItemWeight`), and the tabletop rule requires a fresh
  Shield Craft skill roll _per incoming attack_ to determine whether the shield actually blocks
  that specific hit. Reusing `equipped` as a per-attack pass/fail flag would have meant toggling
  it on/off for every single hit, corrupting its other meanings. The fix was a separate,
  transient, non-persisted signal instead: a checkbox on the Apply Damage chat card
  (`.shield-craft-success`), read live off the DOM at click time in `onApplyDamage`
  (`helpers/chat/handlers.mjs`) rather than baked into `flags.sla` at render time like `pvMod` or
  `attackType` — because its whole purpose is to capture a decision (the narrated roll's outcome)
  made _after_ the card already rendered. When a document field already carries one meaning,
  check whether a new requirement actually needs a second, differently-scoped signal rather than
  overloading the field that's already there.
- **A spec file missing `test.describe.configure({ timeout: 60_000 })` fails intermittently in
  this sandbox, but that's only ever _part_ of the explanation — verify the rest before blaming
  the environment.** While adding shield tests to `tests/e2e/regression-damage.spec.js`, several
  tests — including pre-existing ones I hadn't touched — failed with a bare 30-second timeout or a
  damage-pipeline assertion mismatch that looked like a real regression. `regression-item-sheets
.spec.js`/`regression-actor-sheets.spec.js` already carry `test.describe.configure({ timeout:
60_000 })` (this sandbox's `joinGame`/`waitForSLASystem` overhead alone can approach Playwright's
  default 30-second timeout under load) but `regression-damage.spec.js`/`regression-chat-render
.spec.js` never got it — adding it there was necessary, but **not sufficient**: two of the
  "flaky" failures were real, pre-existing bugs unmasked only once the timeout stopped hiding them
  (see the next two entries). Confirmed the timeout fix and the two real bugs were separate things
  by stashing the entire shield changeset and re-running the untouched spec file against a freshly
  restarted Foundry container — the exact same 4 failures reproduced on pristine code, proving they
  predated this PR and weren't caused by the shield feature. When a test looks flaky in this
  sandbox: add the timeout override if missing, then isolate the still-failing case into a
  throwaway one-off spec and step through it by hand before writing it off as "environment noise."
- **`ChatMessage.create()` inside an `async` helper that isn't itself `await`ed lets the caller's
  promise resolve before the message exists.** `postDamageResultChat`/`postHealResultChat`
  (`module/helpers/chat/damage.mjs`) both called `ChatMessage.create({ content })` without
  `await`, so `applyDamageToVictim`'s own `await postDamageResultChat(...)` only waited for the
  template render, not the chat message write. No test had ever exercised this because nothing
  previously checked `game.messages` right after calling `applyDamageToVictim`/`applyHpHeal` — a
  new shield test that did (`applyDamageToVictim renders both body-armor and shield rows on the
result chat card`) found an empty result every time until `await` was added to both call sites.
  A missing `await` on a fire-and-forget document write is invisible until something reads the
  written document back in the same tick.
- **`resolveActorFromUuid` (`module/helpers/chat/damage.mjs`) only resolves _Token_ uuids
  (`fromUuid(uuid).actor`), not _Actor_ uuids — and several pre-existing e2e tests pass the wrong
  kind.** In real play, `data-target-uuid`/`flags.sla.targets` are always populated from
  `game.user.targets`/`canvas.tokens.controlled` (Token placeables, whose `.uuid` is a Token uuid),
  so the production code is correct. But `onApplyDamage reads dmg/ad/pv-mod/target-uuid...`,
  `onApplyEbbEffects copies the Ebb formula item's...`, and `onRemoveEbbWounds resolves the
victim...` (all pre-existing, none touched by the shield PR) hand it a bare world-Actor uuid
  instead (`victim.uuid` with no Scene/Token in play) — `fromUuid()` then resolves the Actor
  document itself, which has no `.actor` getter, so `resolveActorFromUuid` silently returns `null`
  and the whole operation no-ops. This reproduces 100% of the time, not intermittently, and
  predates this PR (confirmed via the stash test above); it was never caught because
  `regression-damage.spec.js` isn't part of `npm run test:e2e:regression`'s CI-gated file list
  (`.github/workflows/main.yml` only runs that script, never plain `test:e2e`). Fixed for the new
  shield checkbox test by using the already-correct `ebbTarget: 'self'` path instead (resolves the
  acting actor directly from the card's plain `data-actor-uuid`, no Token lookup needed) rather
  than touching the broken pre-existing tests, which is a separate, pre-existing bug outside this
  PR's scope. A spec file living outside the CI-gated list can silently rot indefinitely — the
  same risk CLAUDE.md already documents for `regression-actor-sheets.spec.js`/`regression-sla
.spec.js` before those were added to the gate.
- **An actor-level aggregate field can represent exactly one contributing item, not "all items of
  a type."** `system.armor.resist` (`module/data/actor.mjs`) is synced bidirectionally with
  _one_ equipped powered armor item's resistance for token-bar editing (`actor.mjs:689-709`,
  documented under "Resistance sync" above) — it was never designed to sum multiple items. Adding
  a second independent resistance pool (a shield's, separate from body armor's) had to be tracked
  purely on that item's own `system.resistance`, never surfaced as a second actor-level token bar,
  since extending the existing aggregate to "cover everything" would have silently mixed two
  unrelated pools into one display value. Before assuming an actor-level aggregate represents
  every equipped item of a type, check whether it was built assuming exactly one contributor.
- **A green test suite can just mean the tests verify the implementation instead of the spec.**
  The first cut of `computeArmorMitigation`'s shield support (#351/PR #355) degraded _both_ the
  body armor's and an active shield's `system.resistance` by the full AD on the same hit. That's
  wrong — the PP949 Breacher Shield rule is explicit that "all AD will be inflicted against it
  [the shield]" once it's blocking, i.e. the two pools are mutually exclusive per hit, never both
  debited. The bug shipped in an RC anyway because the unit/e2e tests written alongside it
  asserted exactly that (both-debited) behavior — they were derived from re-reading my own code,
  not from re-reading the rule text, so they passed consistently and proved nothing beyond "the
  code does what the code does." It was only caught by a human re-checking a live damage roll
  against the actual rulebook wording. When a new mechanic is built directly from a rules
  citation, write the test's expected values from that citation before looking at the
  implementation's output — asserting `result.armorRes` against whatever the code just produced
  is circular and will happily encode a misreading forever.
- **A deliberate, well-documented gate can still read as a bug report if the UI gives no hint it
  exists.** Issue #356 reported that an equipped shield's PV/AD priority was "ignored" — but
  `computeArmorMitigation`'s `shieldCraftSuccess` gate (see the entry above and `.docs/DEVELOPER.md`
  "## Shields") was working exactly as designed: the reporter's repro never mentioned the "Shield
  Craft Succeeded" checkbox on the Apply Damage card (`templates/chat/chat-damage.hbs`), which
  defaults to unchecked and had no label text, tooltip, or visual cue explaining what it gates or
  why it exists — nothing distinguished "unused control" from "the reason your shield did nothing."
  Fixed by (a) suppressing the checkbox entirely via a new `showShieldCraftOption` template flag
  (computed in `executeStandardDamageRoll`, `module/helpers/chat/damage.mjs`, from whether the
  resolved target has any equipped `isShield` armor item) when it can never apply to this hit's
  target, and (b) marking a shield's PV in `templates/actor/parts/combat-loadout.hbs` with a `*`
  plus a tooltip (`SLA.ActorSheet.ShieldPvHint`) noting it's conditional. When a mechanic's
  correctness depends on a manual, easy-to-miss control, treat "no one uses the control" as a
  predictable bug report waiting to happen, not user error — either make the control impossible to
  invoke when meaningless, or surface what it does at the point of use, rather than only in a docs
  file no player will read mid-session.
- **A hand-rolled Active-Effect summation layer that mirrors only one of Foundry's native change
  types will silently no-op every stock option it doesn't also implement.** Issue #359: an Active
  Effect on `system.rollModifier.bonus` using Foundry v14's built-in "Subtract" change type (a
  genuine, distinct type Foundry added in v14, not something this system added to the dropdown)
  applied no penalty at all. The actor's derived data never called Foundry's own
  `Actor#applyActiveEffects` for `system.stats.<key>.bonus` / `system.rollModifier.bonus` — it
  hand-rolled a narrower "sum every enabled Add row" model (`sumActiveEffectAddsForStat`/
  `sumActiveEffectAddsForKey`, `module/documents/derived/active-effects.mjs`) that only ever
  recognized the Add type (plus its pre-v14 numeric equivalent), so a Subtract row simply fell
  through and contributed `0` — not an error, not a warning, just silence. Because the Active
  Effect Config sheet itself was never customized, every one of Foundry's 6 native change types
  looked like a legitimate, working choice to a GM; nothing distinguished "this mode isn't
  implemented" from "this mode did what I expected." Fixed by replacing the Add-only sum with
  `computeActiveEffectFieldValue`, a priority-ordered sequential apply that mirrors
  `Actor#applyActiveEffects`'s own semantics for all 6 types (Add/Subtract/Multiply/Downgrade/
  Upgrade/Override; Custom stays a no-op since no system-specific handler is registered, matching
  Foundry's own default). When a derived-data layer reimplements Foundry's own apply logic instead
  of calling it, audit that reimplementation against the _full_ native vocabulary it's standing in
  for, not just the one case the original feature happened to need — a stock dropdown offering an
  option your code doesn't handle is a bug waiting to be filed, not a documentation footnote.
- **`CONST.ACTIVE_EFFECT_CHANGE_TYPES`'s keys are lowercase and its values are unrelated numbers —
  there is no uppercase `.ADD`/`.SUBTRACT` mapping to the type strings, despite that being exactly
  what the pre-existing #330 lessons-learned entry (corrected above) claimed and what this
  session's own first draft of the #359 fix assumed by the same analogy with the deprecated,
  uppercase-keyed `CONST.ACTIVE_EFFECT_MODES`.** Confirmed live against a running Foundry v14.367
  instance: `CONST.ACTIVE_EFFECT_CHANGE_TYPES` is `{ custom: 0, multiply: 10, add: 20, subtract:
20, downgrade: 30, upgrade: 40, override: 50 }` — lowercase keys mapping to each type's default
  _priority_ (also mirrored in `ActiveEffect.CHANGE_TYPES[type].defaultPriority`), not to the
  string values themselves. `CONST.ACTIVE_EFFECT_CHANGE_TYPES.ADD` and `.SUBTRACT` are simply
  `undefined`. The actual `change.type` string values Foundry expects (`'add'`, `'subtract'`,
  etc.) are the enum's own key _names_ — there is nothing to dynamically resolve from CONST at
  all; they're stable literals, same as Foundry's own `switch (change.type) { case "add": ... }`
  in `ActiveEffect._applyChangeUnguided`. This first surfaced as: a fix built against `constants
?.ACTIVE_EFFECT_CHANGE_TYPES?.ADD ?? 'add'` "worked" in unit tests (hand-built fixtures always
  hit the `?? 'add'` fallback, which happens to equal the correct literal) and even seemed
  plausible from reading Foundry's `common/constants.mjs` source too quickly, but a script driving
  the actual running Foundry instance with `type: CONST.ACTIVE_EFFECT_CHANGE_TYPES.SUBTRACT`
  (i.e. `type: undefined`) silently created an Add-behaving effect instead of a Subtract one,
  which is exactly the kind of stale/wrong-shaped-fixture failure the corrected #330 entry above
  already warned about — it just recurred through a _different_ wrong assumption about the same
  constant. Every pre-existing E2E spec that referenced `CONST.ACTIVE_EFFECT_CHANGE_TYPES.ADD`
  (`regression-actor-sheets.spec.js`, `regression-item-actions.spec.js`,
  `regression-damage.spec.js`) had this exact same latent bug and were fixed alongside this one to
  use the literal `'add'` string. When a Foundry CONST object's shape matters, check it live in a
  running instance (`page.evaluate(() => CONST.WHATEVER)`) before writing code or a test fixture
  against it — reading the shipped source file, and even reasoning that "surely it works like the
  deprecated constant it replaced," are both insufficient; only the live runtime value is ground
  truth, and this constant's own doc comment ("Object.freeze({ custom: 0, ... })") was the
  evidence all along, missed twice.
- **Item-embedded Active Effects require an explicit copy-to-actor call in this system —
  `effect.transfer` is inert — and every item type with an Effects tab needs its own real
  trigger, or the tab is a lie.** Issue #363's original report was about Armor granting a stat
  bonus, but the actual repro (per the issue's own comments) turned out to be a generic **Item /
  Gear** item — the reporter tried Armor only because Gear's Effects tab didn't work either.
  Investigating showed _why_: this system never relies on Foundry's native `effect.transfer` —
  `SlaActor._computeCoreStatBonus` (`module/documents/actor.mjs`) only ever reads `this.effects`,
  the actor's own embedded collection, and the only thing that ever copies an item's effects onto
  the actor is `SlaItem.applyItemEffectsToActor()` (`module/documents/item.mjs`). That copy was
  wired up for exactly three types — Drug (`toggleActive()`), Toxicant (failed infection test),
  Ebb Formula (post-roll chat button) — and _every other type still rendered the same Effects tab
  anyway_ (`module/sheets/item-sheet.mjs`'s `TWO_TAB_TYPES` only excluded Skill/Trait/Discipline),
  so Weapon/Armor/Explosive/Magazine/Item/Species/Package all looked equally legitimate to a GM
  filling in Changes, and five of those seven were never wired to anything at all. Fixed by (1)
  adding `SlaItem#setEquipped()` so the plain equip toggle
  (`module/sheets/actor/sheet-actions.mjs`) syncs effects the same way `toggleActive()` already
  did for drugs, (2) adding a Trait grant/revoke case to `SlaActor._onCreateDescendantDocuments`/
  `_onDeleteDescendantDocuments` (already an established pattern for Species — see its
  `_handleSpeciesAdd`/`_handleSpeciesRemove` — extended rather than duplicated) so a trait's
  effect applies for as long as the actor owns it, and (3) removing the Effects tab from every
  type that still had no wiring after that (Weapon, Armor, Explosive, Magazine, Species, Package)
  instead of leaving a control that does nothing. When an item sheet offers a generic capability
  across many types (an Effects tab, in this case), audit _every_ type it's shown on for a real
  consuming code path, not just the type the original feature happened to target — a tab that
  renders identically whether or not anything reads it gives a GM zero signal that half the types
  showing it are decorative.
- **A click-handler test built from a hand-constructed DOM element proves the handler works, not
  that a user can ever reach it.** Issue #369 was the same underlying feature as #363 (Item/Gear
  Active Effects not applying to the actor) recurring after #363 shipped a fix and a passing e2e
  test for it. That test (`regression-sheet-click.spec.js`, "issue #363: equipping gear via
  item-toggle...") synthesizes a `.item-toggle` element by hand (`document.createElement`) and
  calls `handleSheetClick` directly — it correctly proves `SlaItem#setEquipped()` →
  `applyItemEffectsToActor()` works once invoked, but it never renders the real
  `templates/actor/parts/inventory-tab.hbs` template, so it couldn't catch that the template's own
  `{{#if (or (eq item.type "weapon") (eq item.type "armor"))}}` gate never emitted that control for
  Item/Gear rows at all — on the character sheet or the NPC sheet, since both include the same
  partial. A GM had no way to equip Gear from the Inventory tab, so the otherwise-correct handler
  was simply unreachable. Fixed by widening the template condition to include `item`, and by adding
  a companion test that renders the actual sheet, switches to the real Inventory tab, and asserts
  the control is visible before clicking it. When a fix depends on a UI control (a button, a
  toggle, a checkbox) to trigger already-correct logic, a test for that fix needs at least one case
  that renders the real template and asserts the control's visibility — a synthetic/hand-built
  DOM element is fine for exercising the handler in isolation, but it cannot catch "the control
  never appears in the first place," which is exactly the class of bug this was.
- **`SlaItem#setEquipped()` is not the only code path that writes `system.equipped: true` — a
  second one existed and skipped its effects sync entirely.** After #363/#369 fixed the Inventory
  tab's equip toggle to call `setEquipped()` (which both persists `system.equipped` and calls
  `applyItemEffectsToActor()`), a separate auto-equip path was still writing the same field
  directly: `createEquippedItem` (`module/sheets/actor/actor-drops.mjs`), used when
  `shouldAutoEquipDroppedItem` says a Weapon/Armor dropped onto an NPC (or a Weapon dropped onto a
  vehicle's weapon slot) should be auto-equipped on creation, called
  `foundry.utils.setProperty(itemData, 'system.equipped', true)` and
  `actor.createEmbeddedDocuments('Item', [itemData])` directly — never `setEquipped()` — so the
  item's embedded Active Effects were never copied onto the actor even though the sheet showed it
  as equipped. This is exactly the same effects-never-applied bug as #363/#369, but from a second,
  independent entry point that the earlier fix didn't touch because it only looked at the UI
  control (the toggle), not every place in the codebase that sets `system.equipped`. Fixed by
  having `createEquippedItem` also call `item.applyItemEffectsToActor(actor)` after creation.
  When a document field has a "setter" helper that also has a side effect (here,
  `setEquipped()` syncing Active Effects), grep for every other place that writes the same field
  directly (`system.equipped`, in this case) rather than trusting that the helper is the only
  writer — a raw `update()`/`setProperty()`/creation-data write bypasses the side effect silently,
  with no error and no test failure until something specifically checks the side effect happened.
- **`_onCreateDescendantDocuments`/`_onDeleteDescendantDocuments` on the Actor (not a per-Item
  `_onCreate`/`_onDelete` override) is this codebase's established hook point for "do something
  to the actor when a specific item type is added/removed," and it's the right one to extend, not
  bypass.** `SlaActor` already used this pattern for Species (`_handleSpeciesAdd`/
  `_handleSpeciesRemove`, natural weapons and stat grants) before the Trait effect-grant feature
  above needed the identical shape (apply on add, clean up on remove) for a different type. It
  fires regardless of _how_ the item was added — drag-drop, the sidebar Create Item button, a
  compendium import, a macro's `createEmbeddedDocuments` call — which a fix scoped to just the
  drop handler (`module/sheets/actor/actor-drops.mjs`) would not have covered, and covering only
  the obvious entry point is exactly the class of gap issue #363 itself was about. Before adding
  type-specific logic to a single UI entry point (a drop handler, a button click), check whether
  the actor already has a centralized descendant-document hook it belongs in instead.
- **A UUID resolution helper that assumes one document type for every caller breaks silently for
  the others.** Issue #379: `resolveActorFromUuid` (`module/helpers/chat/damage.mjs`) unconditionally
  did `(await fromUuid(targetUuid))?.actor` — correct when `targetUuid` is a Token UUID (the case
  for live play, where `flags.sla.targets` / `data-target-uuid` are populated from
  `game.user.targets` as `t.document.uuid` — see `weapon-rolls.mjs`, `explosive-rolls.mjs`,
  `ebb-rolls.mjs`, `weapon-gates.mjs`), but silently wrong for a plain Actor UUID (a world actor
  with no token/scene involved): `fromUuid()` on an Actor UUID returns the `Actor` document
  itself, which has no `.actor` property, so the helper returned `null`. Every one of its three
  callers (`onApplyDamage`, `onApplyEbbEffects`, `onRemoveEbbWounds` in
  `module/helpers/chat/handlers.mjs`) then hit an `if (!victim) return;` guard and silently
  no-op'd — no error, no HP change, no effect applied, no wound cleared — which looked like three
  unrelated bugs (broken mitigation math, broken effect copy, broken wound-clear order) until
  tracing all three back to the same choke point. None of the surrounding math/logic was actually
  broken. When a resolver/helper takes a generic "uuid" or "id" parameter, check every caller for
  which document types it's actually handed, not just the type the helper's author had in mind —
  and prefer a type check (`doc instanceof Actor`) over drilling into a type-specific property.
