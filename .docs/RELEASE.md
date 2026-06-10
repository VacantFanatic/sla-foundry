# Release Process

## Overview

Releases follow a two-stage workflow:

1. **Pre-release** — one or more release candidates (`-rc1`, `-rc2`, …) for private testing via the dev channel.
2. **Stable release** — published to the Foundry package browser once candidates are clean.

CI (`main.yml`) runs on every push to `main` and every PR: version sync check, Prettier, unit tests, and dist validation. No manual steps are needed for CI.

---

## Version numbering

`system.json` and `package.json` always carry the **target stable semver** (e.g. `2.9.0`). The rc suffix lives only in the git tag — it is never written to source files.

| Git tag | What it means |
|---|---|
| `pre-2.9.0-rc1` | First release candidate for 2.9.0 |
| `pre-2.9.0-rc2` | Second candidate after bug fixes |
| `pre-2.9.0` | Optional final candidate with no rc suffix |
| `2.9.0` | Stable release |

Both `pre-X.Y.Z` and `pre-vX.Y.Z` are accepted (the `v` is stripped automatically).

---

## Pre-release cycle

### 1. Start a new candidate cycle

1. Bump `version` in `package.json` and `system.json` to the target semver (e.g. `2.9.0`).
2. Add a draft `## [2.9.0]` entry to `CHANGELOG.md`.
3. Commit and merge to `main`.
4. Push the first release candidate tag:

```bash
git tag pre-2.9.0-rc1
git push origin pre-2.9.0-rc1
```

The **Pre-release** workflow builds `sla-industries.zip`, patches the manifest URLs for the dev channel, creates a versioned GitHub pre-release (`pre-2.9.0-rc1`), and updates the `latest-pre` release. Testers install via:

```
https://github.com/VacantFanatic/sla-foundry/releases/download/latest-pre/system.json
```

### 2. Fix bugs and cut a new candidate

No version bump needed — `system.json` stays at `2.9.0` throughout the rc cycle.

1. Fix bugs, open PRs, merge to `main`.
2. Push the next tag:

```bash
git tag pre-2.9.0-rc2
git push origin pre-2.9.0-rc2
```

`latest-pre` is automatically updated. Testers hit **Update** in Foundry and get the new build.

Repeat until the candidate is stable.

---

## Promoting to a stable release

1. Finalise `CHANGELOG.md` — remove the draft marker from `## [2.9.0]` and fill in release notes.
2. Update the `download` URL in `system.json` to point to the new tag:
    ```json
    "download": "https://github.com/VacantFanatic/sla-foundry/releases/download/2.9.0/sla-industries.zip"
    ```
3. Commit and merge to `main`.
4. Push the stable tag (no `pre-` prefix; `v` prefix optional):

```bash
git tag 2.9.0
git push origin 2.9.0
```

The **Release** workflow builds the zip, extracts the `CHANGELOG.md` entry, and creates a **draft** GitHub release for both the version tag and `latest`.

5. Review the draft on GitHub and **publish** it. The **Foundry Website Update** workflow (`foundry_manifest_update.yml`) runs on `release: published` and notifies the Foundry package browser.

### Stable release checklist

- [ ] `version` bumped in `package.json` and `system.json`
- [ ] `download` URL in `system.json` updated to the new tag
- [ ] `CHANGELOG.md` entry complete under `## [X.Y.Z]`
- [ ] All CI checks green on `main`
- [ ] At least one rc candidate tested against a real Foundry instance
- [ ] Stable tag pushed
- [ ] Draft release reviewed and published on GitHub

---

## Workflow reference

| Workflow | Trigger | What it does |
|---|---|---|
| `main.yml` | Push to `main`, PRs | Prettier check, unit tests, dist validation |
| `pre-release.yml` | `pre-X.Y.Z[-rcN]` tag | Builds zip, creates versioned pre-release, updates `latest-pre` |
| `release.yml` | `X.Y.Z` tag | Builds zip, creates draft stable release for version tag and `latest` |
| `foundry_manifest_update.yml` | `release: published` | Notifies Foundry package browser |

The `scripts/resolve-prerelease-tag.mjs` module handles tag parsing for `pre-release.yml` and is covered by unit tests in `tests/unit/resolve-prerelease-tag.test.mjs`.
