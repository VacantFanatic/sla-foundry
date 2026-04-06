/**
 * Shared helpers for Foundry E2E tests.
 * @param {import('@playwright/test').Page} page
 */
async function joinGame(page) {
    const user = process.env.FOUNDRY_USER;
    if (!user) throw new Error("FOUNDRY_USER is required");
    await page.goto("/join");
    await page.getByRole("combobox").selectOption({ label: user });
    await page.getByRole("textbox", { name: /password/i }).fill(process.env.FOUNDRY_PASSWORD ?? "");
    await page.getByRole("button", { name: /join game session/i }).click();
    await page.waitForURL(/\/game/, { timeout: 60_000 });
}

/**
 * Wait until Foundry is fully ready: system is SLA, `game.ready` is true, and `game.user` exists.
 * Rolls and other APIs call `game.user.hasPermission` during evaluation; waiting only for `system.id`
 * can run too early and yields "Cannot read properties of null (reading 'hasPermission')".
 * @param {import('@playwright/test').Page} page
 */
async function waitForSLASystem(page) {
    await page.waitForFunction(
        () =>
            globalThis.game?.ready === true &&
            globalThis.game?.user != null &&
            globalThis.game?.system?.id === "sla-industries",
        null,
        { timeout: 90_000 }
    );
}

/**
 * Close Foundry toast notifications (`#notifications`). They use fixed positioning and can sit over
 * sidebar/settings; Playwright will refuse (or time out) real clicks when a `<p>` in the toast
 * intercepts pointer events — dismiss first, then interact with the UI.
 * @param {import('@playwright/test').Page} page
 */
async function dismissFoundryNotifications(page) {
    const closeIn = page.locator("#notifications li").locator("a.close, .close, .notification-close, [data-action='close']");
    for (let i = 0; i < 12; i++) {
        const n = await page.locator("#notifications li").count();
        if (n === 0) break;
        const firstClose = closeIn.first();
        if (!(await firstClose.isVisible().catch(() => false))) break;
        await firstClose.click({ timeout: 3000 });
    }
    if ((await page.locator("#notifications li").count()) > 0) {
        await page.evaluate(() => {
            document.querySelector("#notifications")?.replaceChildren();
        });
    }
}

module.exports = { joinGame, waitForSLASystem, dismissFoundryNotifications };
