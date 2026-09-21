# CLAUDE.md

## Documentation map

Quick reference to every doc in this repo, grouped by purpose. Start with [CONTRIBUTING.md](CONTRIBUTING.md) and [.docs/DEVELOPER.md](.docs/DEVELOPER.md) for day-to-day development. Open the other docs only when the task at hand actually needs them — that's the point of this map: know where something lives without having to search the repo for it.

### Contributing

| Doc                                                      | Covers                                                                                                    |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [CONTRIBUTING.md](CONTRIBUTING.md)                       | Workflow, branching, TDD, code style, opening a PR                                                        |
| [.docs/DEVELOPER.md](.docs/DEVELOPER.md)                 | Architecture, project structure, data models, migration system, public API, common-task recipes           |
| [.docs/DESIGN_PRINCIPLES.md](.docs/DESIGN_PRINCIPLES.md) | Design principles for architecture, UI/UX, API, and process decisions — the tiebreaker for real tradeoffs |
| [.docs/LESSONS_LEARNED.md](.docs/LESSONS_LEARNED.md)     | Non-obvious bugs/footguns found in past sessions — read before non-trivial changes                        |
| [.docs/CLOUD_ENVIRONMENT.md](.docs/CLOUD_ENVIRONMENT.md) | Foundry setup for a Claude Code on the web / Claude Code Remote session                                   |
| [.docs/AGENTS.md](.docs/AGENTS.md)                       | Cursor Cloud agent setup — Foundry secrets, Docker, E2E                                                   |
| [SECURITY.md](SECURITY.md)                               | Private vulnerability reporting process                                                                   |

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

Read [.docs/DEVELOPER.md](.docs/DEVELOPER.md) (architecture, data models, combat flow,
migrations), [.docs/DESIGN_PRINCIPLES.md](.docs/DESIGN_PRINCIPLES.md) (the rules that settle real
tradeoffs in architecture, UI/UX, API, and process), and
[.docs/LESSONS_LEARNED.md](.docs/LESSONS_LEARNED.md) (footguns already found the hard way) before
making non-trivial changes. For anything release-related, also read
[.docs/RELEASE.md](.docs/RELEASE.md) (version numbering, pre-release/stable cycle). All four
describe conventions and mechanisms that aren't obvious from the code alone — reading them is
cheaper than rediscovering the same bug or re-scanning the codebase to reconstruct the convention.

## Code style & TDD

Follow [CONTRIBUTING.md](CONTRIBUTING.md) — code must pass `npm run format:check` (Prettier) and
logic changes follow TDD (`tests/unit/`, `npm run test:unit`). CI enforces both on every PR.

## A passing test only proves what it actually exercises

Before calling a fix done, check whether its test would catch the bug if the fix were reverted —
and whether it exercises the same path a real user/GM does, not a shortcut around it. This has
shipped real regressions in this repo:

- **Issue #363 → #369**: #363 fixed Gear's Active Effects not applying to the actor, and shipped
  with a passing e2e test (`regression-sheet-click.spec.js`) — but that test built a `.item-toggle`
  element with `document.createElement` and called the click handler directly. It proved the
  handler logic worked, but never rendered the real `inventory-tab.hbs` template, so it couldn't
  catch that the template never emitted an equip toggle for Item/Gear rows at all. The bug shipped
  anyway and was refiled as #369 against the exact same feature.

When a fix depends on a UI control (a button, toggle, checkbox) triggering already-correct logic,
write at least one test that renders the real template/sheet and asserts the control is visible
and clickable, in addition to any unit-level test of the handler in isolation — a hand-built DOM
element or a direct function call is fine for the latter but cannot prove the former. More
generally: prefer testing behavior at the boundary a user actually interacts with (a rendered
sheet, a real document create/update) over mocking the layer just below it, and when in doubt, run
the change through a real Foundry instance
([.docs/CLOUD_ENVIRONMENT.md](.docs/CLOUD_ENVIRONMENT.md) /
[.docs/AGENTS.md](.docs/AGENTS.md)) before considering it verified, not just green unit tests.

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

## Lessons learned

Non-obvious lessons discovered during a session — a bug class, a testing pitfall, a footgun in
this codebase or in Foundry's API — live in
[.docs/LESSONS_LEARNED.md](.docs/LESSONS_LEARNED.md), not in this file. When you discover a new
one, add it there before ending your turn, in the same style as the existing entries: concrete,
evidenced by a specific file/commit, and generalized into an actionable rule for next time. Do
this even if the session's main task was something else; that file is only useful if it stays
current.

## Running Foundry for E2E / real UI testing

Unit tests and builds don't need Foundry running; E2E specs and manual UI verification do. Setup
differs by environment — open only the doc for the one you're actually in:

- **Claude Code on the web / Claude Code Remote** (this session's default environment) →
  [.docs/CLOUD_ENVIRONMENT.md](.docs/CLOUD_ENVIRONMENT.md). tl;dr:
  `.claude/hooks/session-start.sh` already attempts to bring Foundry up on boot, so check
  `bash scripts/cloud-foundry.sh status` before doing anything else; if it's down, run
  `bash scripts/cloud-foundry.sh start` then `bootstrap`.
- **Cursor Cloud agents** → [.docs/AGENTS.md](.docs/AGENTS.md) for secrets, Docker paths, and
  environment-specific gotchas.

Once Foundry is up in either environment, run `npm run test:e2e:regression` (or `test:e2e`,
`test:e2e:operators`) — see [.docs/DEVELOPER.md](.docs/DEVELOPER.md) for what each suite covers.
