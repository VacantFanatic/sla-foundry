# Release Process

## Overview

Releases follow a two-stage workflow:

1. **Pre-release** — one or more release candidates (`-rc1`, `-rc2`, …) for private testing via the dev channel.
2. **Stable release** — published to the Foundry package browser once candidates are clean.

CI (`main.yml`) runs on every push to `main` and every PR: version sync check, Prettier, unit tests, and dist validation. No manual steps are needed for CI.

---

## Version numbering

`system.json` and `package.json` in source always carry the **target stable semver** (e.g. `2.9.0`). The rc suffix is injected at build time by the pre-release workflow — it never appears in committed files.

| Git tag         | Version shown in Foundry | What it means                              |
| --------------- | ------------------------ | ------------------------------------------ |
| `pre-2.9.0-rc1` | `2.9.0-rc1`              | First release candidate for 2.9.0          |
| `pre-2.9.0-rc2` | `2.9.0-rc2`              | Second candidate after bug fixes           |
| `pre-2.9.0`     | `2.9.0`                  | Optional final candidate with no rc suffix |
| `2.9.0`         | `2.9.0`                  | Stable release                             |

Both `pre-X.Y.Z` and `pre-vX.Y.Z` are accepted (the `v` is stripped automatically).

Testers can always confirm which candidate they have installed by checking **Settings → System** in Foundry — the version field will show `2.9.0-rc2` (or whichever rc is installed).

---

## Pre-release cycle

### 1. Start a new candidate cycle

Cut and verify the RC **before** merging to `main`, not after — tag pushes trigger the
pre-release workflow regardless of which branch the tagged commit lives on, so there's no need to
land on `main` first just to get a testable build.

1. On the feature/fix PR branch: bump `version` in `package.json` and `system.json` to the target
   semver (e.g. `2.9.0`).
2. Add a draft `## [2.9.0]` entry to `CHANGELOG.md`.
3. Commit and push to the PR branch (`main` stays untouched for now).
4. Push the first release candidate tag, pointing at that branch's tip:

```bash
git tag pre-2.9.0-rc1
git push origin pre-2.9.0-rc1
```

The **Pre-release** workflow patches `system.json` and `package.json` to `2.9.0-rc1`, patches the manifest URLs for the dev channel, builds `sla-industries.zip`, creates a versioned GitHub pre-release (`pre-2.9.0-rc1`), and updates the `latest-pre` release. Foundry will show `2.9.0-rc1` as the installed version. Testers install via:

```
https://github.com/VacantFanatic/sla-foundry/releases/download/latest-pre/system.json
```

5. Once the candidate checks out, merge the PR to `main` (the version bump and changelog entry
   ride along with it).

### 2. Fix bugs and cut a new candidate

No version bump needed — `system.json` stays at `2.9.0` in source throughout the rc cycle; the workflow stamps the rc suffix at build time.

1. Fix bugs on a PR branch (new or the same one, if it hasn't merged yet).
2. Push the next tag, pointing at that branch's tip, to verify before merging:

```bash
git tag pre-2.9.0-rc2
git push origin pre-2.9.0-rc2
```

`latest-pre` is automatically updated. Testers hit **Update** in Foundry and get the new build showing `2.9.0-rc2`.

3. Once verified, merge the PR to `main`.

Repeat until the candidate is stable.

---

## Promoting to a stable release

1. Finalise `CHANGELOG.md` — remove the draft marker from `## [2.9.0]` and fill in release notes.
2. Commit and merge to `main`. (`system.json`'s `download` URL does **not** need manual updating —
   the **Release** workflow patches it to the exact tag being released at build time, the same
   way `pre-release.yml` already patches the pre-release channel's manifest. Source `system.json`
   keeps showing the previous release's `download` value between releases; that's expected, same
   as the pre-release `-rcN` suffix never appearing in committed source either.)
3. Push the stable tag (no `pre-` prefix; `v` prefix optional):

```bash
git tag 2.9.0
git push origin 2.9.0
```

The **Release** workflow builds the zip, extracts the `CHANGELOG.md` entry, and creates a **draft** GitHub release for both the version tag and `latest`.

4. Review the draft on GitHub and **publish** it. The **Foundry Website Update** workflow (`foundry_manifest_update.yml`) runs on `release: published` and notifies the Foundry package browser.

### Stable release checklist

- [ ] `version` bumped in `package.json` and `system.json`
- [ ] `CHANGELOG.md` entry complete under `## [X.Y.Z]`
- [ ] All CI checks green on `main`
- [ ] At least one rc candidate tested against a real Foundry instance
- [ ] Stable tag pushed
- [ ] Draft release reviewed and published on GitHub

---

## Workflow reference

| Workflow                      | Trigger               | What it does                                                          |
| ----------------------------- | --------------------- | --------------------------------------------------------------------- |
| `main.yml`                    | Push to `main`, PRs   | Prettier check, unit tests, dist validation                           |
| `pre-release.yml`             | `pre-X.Y.Z[-rcN]` tag | Builds zip, creates versioned pre-release, updates `latest-pre`       |
| `release.yml`                 | `X.Y.Z` tag           | Builds zip, creates draft stable release for version tag and `latest` |
| `foundry_manifest_update.yml` | `release: published`  | Notifies Foundry package browser                                      |

The `scripts/resolve-prerelease-tag.mjs` module handles tag parsing for `pre-release.yml` and is covered by unit tests in `tests/unit/resolve-prerelease-tag.test.mjs`.
