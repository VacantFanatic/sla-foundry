/**
 * Shared helpers for Foundry E2E tests.
 * @param {import('@playwright/test').Page} page
 */
async function joinGame(page) {
    const user = process.env.FOUNDRY_USER;
    if (!user) throw new Error('FOUNDRY_USER is required');
    await page.goto('/join');
    // Foundry v14's Join Game form is an autocomplete text input (`input[name="username"]`),
    // not the classic `<select name="userid">` dropdown earlier Foundry versions used —
    // confirmed directly from the served client source (JoinGameForm in scripts/foundry.mjs).
    await page.locator('input[name="username"]').fill(user);
    const passwordField = page.locator('input[name="password"]');
    if (await passwordField.count()) await passwordField.fill(process.env.FOUNDRY_PASSWORD ?? '');
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
 *
 * Also exits any in-progress core "tour" (`game.tours`). Foundry auto-starts its "welcome" tour
 * the first time a GM logs into a freshly created world — confirmed live via `game.tours`, whose
 * entries carry `status`/`exit()` (CONST.TOUR_STATUS). The tour renders as a full-screen overlay
 * (`aside.tour-center-step`) that intercepts pointer events for anything behind it until exited,
 * so any test whose first UI interaction is the first click of the run can hang on this. CI
 * provisions a fresh `sla-test-world` on every run, so the tour fires deterministically there.
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

    await page
        .evaluate(() => {
            for (const tour of globalThis.game?.tours?.values?.() ?? []) {
                if (tour.status === 'in-progress') tour.exit();
            }
        })
        .catch(() => {});
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
 * Create an actor for sheet UI tests.
 * @param {import('@playwright/test').Page} page
 * @param {object} [system]
 * @param {"character"|"npc"|"vehicle"} [type]
 * @returns {Promise<string>} actor id
 */
async function createTestActor(page, system = {}, type = 'character') {
    return page.evaluate(
        async ({ actorSystem, actorType }) => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([
                {
                    name: `E2E Actor ${stamp}`,
                    type: actorType,
                    system: actorSystem
                }
            ]);
            return actor.id;
        },
        { actorSystem: system, actorType: type }
    );
}

/**
 * Render a character actor sheet and return a locator scoped to its window.
 * @param {import('@playwright/test').Page} page
 * @param {string} actorId
 */
async function openActorSheet(page, actorId) {
    await page.evaluate(async (id) => {
        const actor = game.actors.get(id);
        if (!actor) throw new Error(`Actor ${id} not found`);
        await actor.sheet.render(true);
    }, actorId);

    const sheet = page.locator('form.application.sla-industries.actor').last();
    await sheet.waitFor({ state: 'visible', timeout: 15_000 });
    return sheet;
}

/**
 * Switch actor sheet tabs (App V2 rail uses data-tab anchors).
 *
 * Uses an in-page `el.click()` rather than a mouse-simulated Playwright click: CI has shown a
 * real (if rare) race where the tab rail gets rebuilt between Playwright's multi-step
 * actionability check (visible, stable, scrolled into view, receives pointer events) and the
 * actual click, surfacing as "element was detached from the DOM, retrying" until the test
 * timeout. A locator-scoped `evaluate()` still waits for the element to be attached, then
 * resolves and clicks it in one synchronous in-page step, closing that window.
 * @param {import('@playwright/test').Locator} sheet
 * @param {string} tabId
 */
async function clickActorSheetTab(sheet, tabId) {
    const tab = sheet.locator(`nav.sheet-tabs a[data-tab="${tabId}"]`);
    await tab.waitFor({ state: 'visible', timeout: 15_000 });
    await tab.evaluate((el) => el.click());
}

/**
 * Delete E2E actors created during tests.
 * @param {import('@playwright/test').Page} page
 */
async function deleteTestActors(page) {
    await page
        .evaluate(async () => {
            for (const actor of game.actors.filter((a) => a.name?.startsWith('E2E Actor '))) {
                await actor.delete();
            }
        })
        .catch(() => {});
}

/**
 * Close open Foundry application windows between tests.
 * @param {import('@playwright/test').Page} page
 */
async function closeApplicationWindows(page) {
    await page
        .evaluate(() => {
            for (const app of globalThis.foundry?.applications?.instances?.values?.() ?? []) {
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
    createTestActor,
    openActorSheet,
    clickActorSheetTab,
    deleteTestActors,
    closeApplicationWindows
};
