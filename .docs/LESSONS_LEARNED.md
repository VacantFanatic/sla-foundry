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
  (string, uppercase-keyed — `CONST.ACTIVE_EFFECT_CHANGE_TYPES.ADD === "add"`), and the E2E
  test's constant access was even wrong-cased (`.add` vs. the real `.ADD`), so it silently
  exercised `mode: undefined` instead of the v14 path it claimed to cover. The fix "worked"
  against its own tests while leaving the real-world bug (#330) completely unfixed. When a
  test constructs a data shape by hand instead of using the real producing API/UI, verify
  that shape against the actual runtime's current schema/constants before trusting it — a
  green test suite only proves the code satisfies its own tests, not that the tests match
  reality.
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
