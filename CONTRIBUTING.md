# Contributing to SLA Industries – Foundry VTT System

Thanks for your interest in contributing. This is an unofficial fan project; all contributions are welcome whether you're fixing a bug, adding a mechanic, improving styles, or updating docs.

## Quick start

```bash
git clone https://github.com/VacantFanatic/sla-foundry.git
cd sla-foundry
npm ci
npm run build        # compile SCSS → css/
npm run test:unit    # run unit tests (no Foundry required)
```

See [CLAUDE.md](CLAUDE.md) and [`.docs/DEVELOPER.md`](.docs/DEVELOPER.md) for full environment setup, including optional Foundry VTT installation for E2E testing.

## Development workflow

### Branching

- Branch from `main` with a short descriptive name: `fix/reload-ammo-check`, `feat/ebb-flux-ui`.
- Keep branches focused — one concern per PR.

### Test-driven development

Follow TDD for all logic changes:

1. Write a failing unit test in `tests/unit/` that captures the expected behaviour.
2. Implement the minimum code to make it pass.
3. Refactor, keeping tests green.

```bash
npm run test:unit
```

Tests use Node's built-in test runner — no Foundry license required.

### Code style

All code must pass [Prettier](https://prettier.io/) before being committed:

```bash
npm run format          # auto-fix
npm run format:check    # check only (what CI runs)
```

CI blocks any PR that fails the format check.

### SCSS

After editing `.scss` files under `src/scss/`, compile before testing in Foundry:

```bash
npm run build:css
```

## Opening a pull request

1. Ensure `npm run format:check` and `npm run test:unit` both pass locally.
2. Update [CHANGELOG.md](CHANGELOG.md) under the current draft `## [Unreleased]` section.
3. Open a PR against `main` with a clear title and description explaining **what** changed and **why**.
4. Link any related issues (`Closes #123`).

CI will run Prettier, unit tests, and dist validation automatically. A maintainer will review and merge once checks are green.

## Reporting bugs

Open a [GitHub issue](https://github.com/VacantFanatic/sla-foundry/issues) with:

- Foundry VTT version and system version (Settings → System)
- Steps to reproduce
- What you expected vs. what happened
- Browser console errors if applicable

## Security issues

Do **not** open public issues for security vulnerabilities. See [SECURITY.md](SECURITY.md) for the private reporting process.

## License

By contributing, you agree that your contributions will be licensed under the project's [MIT License](package.json).
