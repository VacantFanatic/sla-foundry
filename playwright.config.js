const { defineConfig, devices } = require("@playwright/test");

/**
 * E2E tests against a running Foundry instance (not started by Playwright).
 *
 * Environment:
 *   FOUNDRY_URL          Base URL (default: http://127.0.0.1:30000)
 *   FOUNDRY_USER         Display name of the user on /join (e.g. Cursor)
 *   FOUNDRY_PASSWORD     User password (may be empty if your user allows it)
 *
 * Run: npm run test:e2e:install && npm run test:e2e
 */
module.exports = defineConfig({
    testDir: "./tests/e2e",
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    reporter: [["list"], ["html", { open: "never" }]],
    use: {
        baseURL: process.env.FOUNDRY_URL || "http://127.0.0.1:30000",
        trace: "on-first-retry",
        screenshot: "only-on-failure",
        video: "retain-on-failure"
    },
    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] }
        }
    ]
});
