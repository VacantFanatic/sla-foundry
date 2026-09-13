# Lessons learned

Non-obvious lessons discovered during past sessions — bug classes, testing pitfalls, footguns in
this codebase or in Foundry's API. Read this before making non-trivial changes (see
[CLAUDE.md](../CLAUDE.md) → "Before starting work").

When you discover a new one, add it here before ending your turn, in the same style as the
entries below: concrete, evidenced by a specific file/commit, and generalized into an actionable
rule for next time. Do this even if the session's main task was something else — this file is
only useful if it stays current.

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
  reliable lever to pull.
