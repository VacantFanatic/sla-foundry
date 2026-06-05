# AGENTS.md

## Cursor Cloud specific instructions

This repository is a **Foundry VTT v14 game system** (SLA Industries 2nd Edition). There is no standalone web app or `npm run dev` server — Foundry is the runtime.

### What works without Foundry

| Task | Command |
|------|---------|
| Install JS deps | `npm install` |
| Compile SCSS | `npm run build` (or `npm run watch` while editing styles) |
| Unit tests | `npm run test:unit` (Node built-in test runner; no Foundry required) |

There is **no** `npm run lint` script or ESLint config; format with Prettier locally if needed (`DEVELOPER.md`).

### Foundry (required for E2E and real UI testing)

1. **Install Foundry VTT v14** (verified against **14.360** per `system.json`). This cloud VM uses Docker (`ghcr.io/felddy/foundryvtt:14`) when credentials are provided.
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

See `DEVELOPER.md` for architecture, migrations, and API details.
