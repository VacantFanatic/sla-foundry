const { defineConfig, devices } = require('@playwright/test');

/**
 * E2E tests against a running Foundry instance (not started by Playwright).
 *
 * Environment:
 *   FOUNDRY_URL          Base URL (default: http://127.0.0.1:30000)
 *   FOUNDRY_USER         Display name of the user on /join (e.g. Cursor)
 *   FOUNDRY_PASSWORD     User password (may be empty if your user allows it)
 *
 * Run: npm run test:e2e:install && npm run test:e2e
 * Authenticated SLA regression: npm run test:e2e:regression (requires FOUNDRY_USER; includes item sheet UI)
 * Operators / dice / GM API: npm run test:e2e:operators (GM tests need a GM user)
 */
module.exports = defineConfig({
    testDir: './tests/e2e',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    reporter: [['list'], ['html', { open: 'never' }]],
    use: {
        baseURL: process.env.FOUNDRY_URL || 'http://127.0.0.1:30000',
        // Foundry's own documented minimum supported resolution — below this it shows a
        // persistent "screen resolution too small" warning toast (see CLAUDE.md's viewport
        // lessons-learned entry). NOTE: this top-level value is shadowed by whatever the
        // `chromium` project's `use` sets below (project-level `use` wins the merge), so it
        // must also be set there explicitly, not just here.
        viewport: { width: 1366, height: 768 },
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure'
    },
    // Visual regression baselines (tests/e2e/regression-visual-actor-sheets.spec.js). Generate/refresh
    // baselines against a live Foundry instance with: npx playwright test regression-visual-actor-sheets --update-snapshots
    expect: {
        toHaveScreenshot: { maxDiffPixelRatio: 0.02 }
    },
    projects: [
        {
            name: 'chromium',
            // `devices['Desktop Chrome']` carries its own `viewport: 1280x720`, which silently
            // overrode the 1366x768 above (project-level `use` wins). Override it back to
            // Foundry's minimum explicitly.
            use: {
                ...devices['Desktop Chrome'],
                viewport: { width: 1366, height: 768 }
            }
        }
    ]
});
