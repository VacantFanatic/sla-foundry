# Running Foundry in the default Claude Code cloud environment

This is the environment a Claude Code on the web / Claude Code Remote session runs in by
default — distinct from the Cursor Cloud setup in [AGENTS.md](AGENTS.md) (data directory,
secrets mechanism, and a couple of sandbox-specific quirks all differ). Everything here was
exercised end-to-end in a real session: building `dist/`, starting Foundry in Docker with real
credentials, and running the full `test:e2e:regression` suite (43/43) against it, driving
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

## Getting Foundry running

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
   same commands [AGENTS.md](AGENTS.md) documents for Cursor Cloud work here too:

    ```bash
    bash scripts/cloud-foundry.sh start      # build dist/, install into Foundry data, launch sla-test-world
    bash scripts/cloud-foundry.sh bootstrap  # first boot only: EULA + world launch + create FOUNDRY_USER
    npm run test:e2e:regression              # once /join is ready
    ```

## What's different from Cursor Cloud

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
- See the `devices['Desktop Chrome']` viewport entry in
  [LESSONS_LEARNED.md](LESSONS_LEARNED.md) for this sandbox's own software-rendering quirks (why
  widening the E2E viewport past the accidental 1280x720 destabilized the suite here, and why
  Foundry's own "screen too small" warning still needs a notification-dismissal workaround
  rather than a viewport fix).
- **A released Foundry version can outrun this sandbox's pinned Chromium.** As of Foundry v14
  Build 367, the `/setup` page shows a hard banner ("uses modern JavaScript features which are
  unsupported on Chromium version less than 146. You are using Chromium version 141.") and its
  custom tab-switch handler for "Game Worlds"/"Game Systems"/"Add-on Modules" (`<h2
data-tab="...">` paired with `<section data-tab="...">`, not real `<a>`/`<button>` elements)
  stops working: clicking the "Game Worlds" tab header resolves the locator but the target
  `<section>` never gains the `active` class, so the world list never becomes visible/clickable.
  `scripts/foundry-bootstrap.mjs`'s own world-launch step fails with the exact same
  `locator.click: Timeout 30000ms exceeded ... element is not visible` symptom, confirming this
  isn't a one-off script bug. If `bash scripts/cloud-foundry.sh bootstrap`/`start` fails this way,
  don't keep retrying selector variations — it's this environment's Chromium build, not the
  script. Fall back to unit tests (`npm run test:unit`) plus careful manual code review, and say
  plainly that live e2e verification wasn't possible in that session.

See [DEVELOPER.md](DEVELOPER.md) for architecture, migrations, and API details, and
[AGENTS.md](AGENTS.md) for the Cursor Cloud equivalent of this setup.
