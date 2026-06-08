/**
 * Shared helpers for Foundry E2E tests.
 * @param {import('@playwright/test').Page} page
 */
async function joinGame(page) {
    const user = process.env.FOUNDRY_USER;
    if (!user) throw new Error('FOUNDRY_USER is required');
    await page.goto('/join');
    await page.getByRole('combobox').selectOption({ label: user });
    await page.getByRole('textbox', { name: /password/i }).fill(process.env.FOUNDRY_PASSWORD ?? '');
    await page.getByRole('button', { name: /join game session/i }).click();
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
            globalThis.game?.system?.id === 'sla-industries',
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
    const closeIn = page
        .locator('#notifications li')
        .locator("a.close, .close, .notification-close, [data-action='close']");
    for (let i = 0; i < 12; i++) {
        const n = await page.locator('#notifications li').count();
        if (n === 0) break;
        const firstClose = closeIn.first();
        if (!(await firstClose.isVisible().catch(() => false))) break;
        await firstClose.click({ timeout: 3000 });
    }
    if ((await page.locator('#notifications li').count()) > 0) {
        await page.evaluate(() => {
            document.querySelector('#notifications')?.replaceChildren();
        });
    }
}

/**
 * Create a world Item document for sheet UI tests.
 * @param {import('@playwright/test').Page} page
 * @param {string} type
 * @param {object} [system]
 * @returns {Promise<string>} item id
 */
async function createWorldItem(page, type, system = {}) {
    return page.evaluate(
        async ({ itemType, itemSystem }) => {
            const stamp = Date.now();
            const [item] = await Item.createDocuments([
                {
                    name: `E2E Item ${itemType} ${stamp}`,
                    type: itemType,
                    system: itemSystem
                }
            ]);
            return item.id;
        },
        { itemType: type, itemSystem: system }
    );
}

/**
 * Render an item sheet and return a locator scoped to its application window.
 * @param {import('@playwright/test').Page} page
 * @param {string} itemId
 */
async function openItemSheet(page, itemId) {
    await page.evaluate(async (id) => {
        const item = game.items.get(id);
        if (!item) throw new Error(`Item ${id} not found`);
        await item.sheet.render(true);
    }, itemId);

    const sheet = page.locator('form.application.sla-industries.item').last();
    await sheet.waitFor({ state: 'visible', timeout: 15_000 });
    return sheet;
}

/**
 * Switch item sheet tabs (App V2 uses data-tab anchors, not link roles).
 * @param {import('@playwright/test').Locator} sheet
 * @param {"attributes"|"description"|"effects"} tabId
 */
async function clickItemSheetTab(sheet, tabId) {
    await sheet.locator(`nav.sheet-tabs a[data-tab="${tabId}"]`).click();
}

/**
 * Close open Foundry application windows between tests.
 * @param {import('@playwright/test').Page} page
 */
async function closeApplicationWindows(page) {
    await page
        .evaluate(() => {
            for (const app of globalThis.ui?.applications?.values?.() ?? []) {
                app.close?.();
            }
        })
        .catch(() => {});
    await page.keyboard.press('Escape').catch(() => {});
}

module.exports = {
    joinGame,
    waitForSLASystem,
    dismissFoundryNotifications,
    createWorldItem,
    openItemSheet,
    clickItemSheetTab,
    closeApplicationWindows
};
