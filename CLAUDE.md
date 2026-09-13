# CLAUDE.md

## Documentation map

Quick reference to every doc in this repo, grouped by purpose. Start with [CONTRIBUTING.md](CONTRIBUTING.md) and [.docs/DEVELOPER.md](.docs/DEVELOPER.md) for day-to-day development.

### Contributing

| Doc                                                                    | Covers                                                                                          |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [CONTRIBUTING.md](CONTRIBUTING.md)                                     | Workflow, branching, TDD, code style, opening a PR                                              |
| [.docs/DEVELOPER.md](.docs/DEVELOPER.md)                               | Architecture, project structure, data models, migration system, public API, common-task recipes |
| "Running Foundry in the default Claude Code cloud environment" (below) | Foundry setup for a Claude Code on the web / Claude Code Remote session                         |
| [.docs/AGENTS.md](.docs/AGENTS.md)                                     | Cursor Cloud agent setup — Foundry secrets, Docker, E2E (mirrored inline below)                 |
| [SECURITY.md](SECURITY.md)                                             | Private vulnerability reporting process                                                         |

### Gameplay systems (for GMs and contributors)

| Doc                                                | Covers                                                        |
| -------------------------------------------------- | ------------------------------------------------------------- |
| [.docs/EBB_SYSTEM.md](.docs/EBB_SYSTEM.md)         | Ebb powers: Ebonite detection, formula rolls, tab visibility  |
| [.docs/WORLD_SETTINGS.md](.docs/WORLD_SETTINGS.md) | Every world setting: key, default, and behavior               |
| [.docs/item_setup.md](.docs/item_setup.md)         | Drag-and-drop item linking guide (skills, weapons, ammo, Ebb) |

### Release & CI

| Doc / file                                          | Covers                                                                                |
| --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [.docs/RELEASE.md](.docs/RELEASE.md)                | Two-stage pre-release/stable release process, version numbering                       |
| [CHANGELOG.md](CHANGELOG.md)                        | Release history — update the `## [Unreleased]` section in every PR                    |
| `.github/workflows/main.yml`                        | CI: version sync, Prettier, unit tests, dist build+validate (every push/PR to `main`) |
| `.github/workflows/pre-release.yml` / `release.yml` | Build, package, and publish pre-release/stable GitHub Releases on tag push            |
| `.github/workflows/foundry_manifest_update.yml`     | Notifies Foundry's package listing API when a release is published                    |

### Config reference

| File                              | Covers                                                         |
| --------------------------------- | -------------------------------------------------------------- |
| `system.json`                     | Foundry manifest — id, version, compatibility, `documentTypes` |
| `package.json`                    | npm scripts (build/test/format/package), devDependencies       |
| `.prettierrc` / `.prettierignore` | Code formatting rules                                          |
| `.editorconfig`                   | Baseline editor settings (indent, line endings, final newline) |
| `playwright.config.js`            | E2E test config                                                |

---

## Before starting work

Read `.docs/DEVELOPER.md` (architecture, data models, combat flow, migrations) and, for
anything release-related, `.docs/RELEASE.md` (version numbering, pre-release/stable cycle)
before making non-trivial changes. Both describe conventions and mechanisms that aren't
obvious from the code alone.

## Lessons learned

When you discover a new non-obvious lesson during a session — a bug class, a testing
pitfall, a footgun in this codebase or in Foundry's API — add it as a new bullet here
before ending your turn, in the same style as the entries below: concrete, evidenced by a
specific file/commit, and generalized into an actionable rule for next time. Do this even
if the session's main task was something else; this section is only useful if it stays
current.

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

## Code style

All code changes must pass Prettier before being committed. Run the check with:

```bash
npm run format:check
```

To auto-fix formatting:

```bash
npm run format
```

CI enforces this on every PR (`main.yml` → "Check formatting" step), so any commit that fails `format:check` will block the build. Always run `npm run format` on new or modified files before committing.

## Test-driven development

Follow TDD for all logic changes:

1. Write a failing unit test in `tests/unit/` that captures the expected behaviour.
2. Implement the minimum code to make it pass.
3. Refactor, keeping tests green.

Run unit tests with:

```bash
npm run test:unit
```

Tests use Node's built-in test runner (`node --test`) — no Foundry required. Pure helper functions and data-model logic are the primary targets; UI and Foundry-API-dependent code is covered by E2E specs instead.

## Keep tests in sync with the code

When a change moves markup, renames a `data-*` attribute or CSS class, relocates content to a
different tab/panel, or otherwise changes a sheet/dialog's structure, update every test that
touches that structure in the **same** change — don't leave it for a later pass. A test left
behind doesn't fail loudly and get noticed; it fails much later, looking like a mystery
regression, when the actual cause was simply that the test still assumes the old layout.

This is not hypothetical: several `tests/e2e/regression-actor-sheets.spec.js` and
`regression-sla.spec.js` failures diagnosed in this session's CI runs (job `103622272003`) turned
out to be exactly this — a wound-diagram locator using an attribute name (`data-area`) the markup
had never actually used, and an HP-bar assertion missing a tab switch after the HP bar moved into
`combat-tab.hbs`. Both tests were stale against the current layout, not testing a real bug; they'd
clearly been failing since whenever the layout last changed, just unnoticed because the E2E suite
had no CI gate until this session added one. Update the test in the same PR that changes the
markup it depends on, so drift like this can't accumulate silently again.

## Running Foundry in the default Claude Code cloud environment

This is the environment a Claude Code on the web / Claude Code Remote session runs in by
default — distinct from the Cursor Cloud setup in the mirrored `AGENTS.md` section below (data
directory, secrets mechanism, and a couple of sandbox-specific quirks all differ). Everything
here was exercised end-to-end in a real session: building `dist/`, starting Foundry in Docker with
real credentials, and running the full `test:e2e:regression` suite (43/43) against it, driving
PR #336's `e2e` CI job green.

**Foundry credentials are configured per Claude Code _environment_, not account-wide or
repo-wide.** A session running in an environment where nobody has ever added the variables below
genuinely cannot run Foundry — no script or workaround changes that, and it is the expected,
normal state, not a broken setup or a regression from the session that got this working. Don't
assume every session automatically has Foundry access just because a past session on this repo
did; check first (`bash scripts/cloud-foundry.sh status`, or a redacted `env | grep -c
FOUNDRY_USERNAME`) rather than assuming either way. Everything **not** Foundry-dependent —
`npm ci`, `npm run build`, `npm run format:check`, `npm run test:unit` — works in any environment
regardless of credentials; only `npm run test:e2e*` and anything driving a real browser against
`/join` needs them. If a task genuinely requires Foundry and this environment doesn't have it,
say so plainly rather than guessing around it — getting it working means adding the credentials
below to _this specific environment's_ settings (which only someone with access to that
environment's configuration can do), not something fixable from inside a session.

### Getting Foundry running

1. **Configure credentials as environment variables on the Claude Code environment itself**
   (not typed into chat, not a Cursor-style "Cloud Agents → Secrets" dashboard — this is a
   different product with its own per-environment env var settings):

    | Variable                   | Purpose                                                                                       |
    | -------------------------- | --------------------------------------------------------------------------------------------- |
    | `FOUNDRY_USERNAME`         | foundryvtt.com account email (preferred — doesn't expire)                                     |
    | `FOUNDRY_ACCOUNT_PASSWORD` | foundryvtt.com account password, paired with `FOUNDRY_USERNAME`                               |
    | `FOUNDRY_LICENSE_KEY`      | Optional — account login usually auto-applies it                                              |
    | `FOUNDRY_USER`             | Display name for the Playwright test user on `/join`; must be a Gamemaster for the full suite |
    | `FOUNDRY_PASSWORD`         | Optional password for that in-world user                                                      |

    Env vars set after a session has already started don't retroactively appear in that
    session's shell — start a fresh session (or ask to be told to check a new one) after adding
    or changing them.

2. **`.claude/hooks/session-start.sh`** (registered via `.claude/settings.json`'s `SessionStart`
   hook) runs automatically on every session boot when `CLAUDE_CODE_REMOTE=true`: `npm install`,
   makes `scripts/*.sh` executable, installs any of `ripgrep`/`curl`/`docker.io` that are
   missing, then best-effort runs `scripts/ensure-docker.sh` → `scripts/cloud-foundry.sh prepare`
   → `scripts/cloud-foundry.sh start`. Every Foundry step is wrapped so a missing credential or a
   transient Docker/network hiccup never blocks the session from starting — so a session may
   already have Foundry up (or attempting to come up) before you do anything. Check first:

    ```bash
    bash scripts/cloud-foundry.sh status   # foundry:up <url> / foundry:starting / foundry:down
    ```

3. **If it isn't up yet** (fresh credentials, or the hook's best-effort start didn't land), the
   same commands `.docs/AGENTS.md` documents for Cursor Cloud work here too:

    ```bash
    bash scripts/cloud-foundry.sh start      # build dist/, install into Foundry data, launch sla-test-world
    bash scripts/cloud-foundry.sh bootstrap  # first boot only: EULA + world launch + create FOUNDRY_USER
    npm run test:e2e:regression              # once /join is ready
    ```

### What's different from Cursor Cloud

- **Data directory** is `/root/foundry-data`, not `/home/ubuntu/foundry-data` — the session-start
  hook exports `FOUNDRY_DATA_DIR=/root/foundry-data` before calling into the same
  `scripts/cloud-foundry.sh`/`scripts/start-foundry.sh` that default to the Cursor path.
- **This sandbox sits behind a TLS-reterminating egress proxy.** `scripts/start-foundry.sh`
  already detects `/root/.ccr/ca-bundle.crt` and, when present, mounts it into the Foundry
  container and sets `NODE_EXTRA_CA_CERTS`/`CURL_CA_BUNDLE` so both the container's Node auth
  step and its `curl`-based release download trust it — this is automatic, but if a fresh
  `foundry` container fails auth or download with a `self-signed certificate in certificate
chain` error, this is the first thing to check (see `/root/.ccr/README.md`).
- **The pre-installed Chromium doesn't match `@playwright/test`'s expected browser revision**
  (this environment's Chromium at `/opt/pw-browsers/chromium` vs. whatever revision the pinned
  `@playwright/test` version wants — `npx playwright install` will try to download the "right"
  one, which the outbound proxy may or may not allow). `scripts/foundry-bootstrap.mjs` and
  `scripts/ensure-foundry-user.mjs` both already fall back to `/opt/pw-browsers/chromium` when
  present. Running `npx playwright test` **directly** in this sandbox (as opposed to through
  `npm run test:e2e:*`, and as opposed to CI, which downloads its own matching browser via
  `npm run test:e2e:install`) needs the same fallback added temporarily to
  `playwright.config.js`'s `projects[0].use.launchOptions.executablePath` —
  **revert that change before committing**; it must never land in a real commit, since CI needs
  the real pinned browser, not this sandbox's substitute.
- Redact secret env var values before printing or logging them for debugging (e.g. `sed -E
's/(PASSWORD|LICENSE_KEY|USERNAME)=.*/\1=<redacted>/'` over `env | grep -i FOUNDRY`) — never
  print `FOUNDRY_ACCOUNT_PASSWORD`/`FOUNDRY_LICENSE_KEY` in the clear.
- See the `devices['Desktop Chrome']` viewport lessons-learned entry above for this sandbox's
  own software-rendering quirks (why widening the E2E viewport past the accidental 1280x720
  destabilized the suite here, and why Foundry's own "screen too small" warning still needs a
  notification-dismissal workaround rather than a viewport fix).

---

# AGENTS.md

## Cursor Cloud specific instructions

This repository is a **Foundry VTT v14 game system** (SLA Industries 2nd Edition). There is no standalone web app or `npm run dev` server — Foundry is the runtime.

### What works without Foundry

Cloud agents can develop and verify this repo **without** Foundry license secrets using the commands below. E2E and in-browser testing stay optional until you run your own Foundry instance locally or add credentials.

| Task            | Command                                                              |
| --------------- | -------------------------------------------------------------------- |
| Install JS deps | `npm ci`                                                             |
| Compile SCSS    | `npm run build` (or `npm run watch` while editing styles)            |
| Unit tests      | `npm run test:unit` (Node built-in test runner; no Foundry required) |

There is **no** `npm run lint` script or ESLint config; format with Prettier locally if needed (`.docs/DEVELOPER.md`).

### Foundry (required for E2E and real UI testing)

#### Why other agents have Foundry but this chat skipped it

Foundry is **not** bundled in the repo. Other cloud agents usually have one of:

1. **Workspace secrets** in [Cursor → Cloud Agents → Secrets](https://cursor.com/dashboard/cloud-agents) (persists across runs; preferred)
2. A **saved VM snapshot** taken after Foundry was installed and licensed once
3. A cached `foundryvtt-*.zip` under `/home/ubuntu/foundry-data/container_cache/` from a prior install

Skipping secrets in a single chat prompt does **not** add them to the workspace. Add them in the dashboard, then re-run the agent or call `bash scripts/cloud-foundry.sh start`.

This repo includes `.cursor/environment.json` so new agents run `scripts/cloud-foundry.sh` on boot when secrets exist.

#### Cursor Cloud secrets

Configure these in **Cloud Agents → Secrets** (one download method is enough):

| Secret                     | Purpose                                                                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `FOUNDRY_RELEASE_URL`      | Timed **Node.js** download URL from [foundryvtt.com/me/licenses](https://foundryvtt.com/me/licenses) (Operating System → Node.js → Timed URL) |
| `FOUNDRY_LICENSE_KEY`      | License key `AAAA-BBBB-...` (optional if using account login; Docker can auto-fetch)                                                          |
| `FOUNDRY_USERNAME`         | foundryvtt.com email (alternative to `FOUNDRY_RELEASE_URL`)                                                                                   |
| `FOUNDRY_ACCOUNT_PASSWORD` | foundryvtt.com password (only with `FOUNDRY_USERNAME`; do not confuse with join-page password)                                                |
| `FOUNDRY_USER`             | Display name on `/join` for Playwright E2E                                                                                                    |
| `FOUNDRY_PASSWORD`         | Optional password for that **game** user on `/join`                                                                                           |

Start server after secrets are set:

```bash
bash scripts/cloud-foundry.sh start   # preferred: copies system, creates sla-test-world, launches when /join is ready
bash scripts/cloud-foundry.sh bootstrap  # first boot: EULA + world launch + FOUNDRY_USER
npm run test:env                      # build + unit + E2E when /join is ready (not merely port open)
```

#### Docker persistence (cloud VM)

Foundry runs in Docker via `scripts/start-foundry.sh` with data bind-mounted to **`/home/ubuntu/foundry-data`** (survives agent sessions on the same VM):

| Path                                                         | Purpose                                                          |
| ------------------------------------------------------------ | ---------------------------------------------------------------- |
| `/home/ubuntu/foundry-data/Data/`                            | Worlds, systems, users                                           |
| `/home/ubuntu/foundry-data/container_cache/foundryvtt-*.zip` | One-time Foundry download (reused after first install)           |
| `/home/ubuntu/foundry-data/Config/`                          | Server options (preserved with `CONTAINER_PRESERVE_CONFIG=true`) |

The container uses `--restart unless-stopped` and a stable `--hostname foundry-server` (license binding). **Timed `FOUNDRY_RELEASE_URL` values expire in minutes** — refresh at [foundryvtt.com/me/licenses](https://foundryvtt.com/me/licenses) if startup fails with HTTP 403, or add `FOUNDRY_USERNAME` + `FOUNDRY_ACCOUNT_PASSWORD` instead. After the first successful download, the zip in `container_cache/` makes the timed URL unnecessary.

Release builds use **`dist/`** (runtime files only). `npm run build` compiles SCSS and assembles `dist/`; `npm run package` creates `sla-industries.zip`. `cloud-foundry.sh` deploys **`dist/`** into Foundry data (not the full git tree). The test world id is `sla-test-world` (`FOUNDRY_WORLD` / `FOUNDRY_WORLD_ID`). Run `bash scripts/cloud-foundry.sh bootstrap` (or `node scripts/ensure-foundry-user.mjs`) if `FOUNDRY_USER` is not on the join page yet. `foundry:status` requires a joinable world; `foundry:starting` means the server is up but EULA/world launch is still pending.

If cloud secrets are not configured, export the same variables in your shell (or pass them only for that command) before running the script — Foundry cannot be downloaded without them.

1. **Install Foundry VTT v14** (verified against **14.367** per `system.json`). This cloud VM uses Docker (`ghcr.io/felddy/foundryvtt:14`) when credentials are provided.
2. **Link this repo** into Foundry data as `Data/systems/sla-industries` (folder name must match `system.json` `id`). On this VM the symlink is already at `/home/ubuntu/foundry-data/Data/systems/sla-industries` → `/workspace`.
3. **Create a world** using game system **SLA Industries 2nd Edition** and at least one user for `/join`.
4. **Environment variables for Playwright** (see `playwright.config.js`):
    - `FOUNDRY_URL` — default `http://127.0.0.1:30000`
    - `FOUNDRY_USER` — display name on the join page (required for authenticated E2E)
    - `FOUNDRY_PASSWORD` — if the user has a password
5. GM-only operator tests (`npm run test:e2e:operators`) need `FOUNDRY_USER` to be a Gamemaster.

Example Docker start (after setting secrets in the environment):

```bash
docker run -d --name foundry \
  --hostname foundry-server \
  -p 30000:30000 \
  -v /home/ubuntu/foundry-data:/data \
  -e FOUNDRY_RELEASE_URL \
  -e FOUNDRY_LICENSE_KEY \
  ghcr.io/felddy/foundryvtt:14
```

Use a **stable `--hostname`**; Foundry binds licenses to the container host.

On this cloud VM, run Docker with `sudo` unless your user is in the `docker` group (`sudo usermod -aG docker $USER`, then start a new shell).

### E2E commands

```bash
npm run test:e2e:install   # Chromium (once per fresh VM)
npm run test:e2e           # smoke + all specs
npm run test:e2e:regression
npm run test:e2e:operators
```

### Gotchas

- Playwright does **not** start Foundry; the server must already be listening on `FOUNDRY_URL`.
- After SCSS changes, run `npm run build` — hot reload is via Foundry refresh (F5), not Vite.
- Foundry toast notifications can block Playwright clicks; tests use `dismissFoundryNotifications()` in `tests/e2e/fixtures.js`.

### Environment verification

```bash
npm run test:env    # build + unit tests; E2E if Foundry is listening
bash scripts/cloud-foundry.sh status
```

See `.docs/DEVELOPER.md` for architecture, migrations, and API details.
