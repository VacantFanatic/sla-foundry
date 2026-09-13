/**
 * Visual regression for the three actor sheet types (operative/character, NPC/threat,
 * vehicle), using Playwright's screenshot diffing instead of the old manual PNG capture.
 *
 * Baselines are NOT committed by this change — generate/refresh them against a live
 * Foundry instance with:
 *   npx playwright test regression-visual-actor-sheets --update-snapshots
 * then commit the resulting tests/e2e/regression-visual-actor-sheets.spec.js-snapshots/ directory.
 *
 * Actor/item names elsewhere in this repo are Date.now()-stamped for uniqueness, but that
 * makes screenshots non-deterministic — every region here uses a fixed name instead so
 * diffs reflect real UI changes, not timestamps.
 */
const { test, expect } = require('@playwright/test');
const {
    joinGame,
    waitForSLASystem,
    dismissFoundryNotifications,
    openActorSheet,
    clickActorSheetTab,
    closeApplicationWindows
} = require('./fixtures');

test.describe.configure({ timeout: 180_000 });

async function deleteScreenshotActors(page) {
    await page
        .evaluate(async () => {
            for (const actor of game.actors.filter((a) => a.name?.startsWith('Screenshot '))) {
                await actor.delete();
            }
        })
        .catch(() => {});
}

test.describe('Actor sheet visual regression', () => {
    test.beforeEach(async ({ page }) => {
        test.skip(!process.env.FOUNDRY_USER, 'Set FOUNDRY_USER');
        await joinGame(page);
        await waitForSLASystem(page);
        const gm = await page.evaluate(() => game.user?.isGM === true);
        test.skip(!gm, 'Requires GM');
        await page.evaluate(() => {
            if (globalThis.game?.paused) globalThis.game.togglePause();
        });
        await dismissFoundryNotifications(page);
    });

    test.afterEach(async ({ page }) => {
        await deleteScreenshotActors(page);
        await closeApplicationWindows(page);
    });

    test('operative sheet — header, stats strip, tab rail, and each tab', async ({ page }) => {
        const actorId = await page.evaluate(async () => {
            const [actor] = await Actor.createDocuments([
                {
                    name: 'Screenshot Operative',
                    type: 'character',
                    system: {
                        stats: { str: { value: 4 }, dex: { value: 3 }, init: { value: 22 } },
                        hp: { value: 22, max: 30 },
                        xp: { value: 120 },
                        finance: { credits: 1820, unis: 0, debt: 0 },
                        wounds: { head: false, torso: false, lArm: true, rArm: false, lLeg: false, rLeg: false }
                    }
                }
            ]);
            return actor.id;
        });

        const sheet = await openActorSheet(page, actorId);
        const operativeTabs = ['main', 'combat', 'inventory', 'effects', 'traits', 'notes'];

        await expect(sheet.locator('.stats-strip-container')).toHaveScreenshot('operative-stats-strip.png');
        await expect(sheet.locator('nav.sla-sheet-tab-rail')).toHaveScreenshot('operative-tab-rail.png');

        for (const tabId of operativeTabs) {
            await clickActorSheetTab(sheet, tabId);
            await sheet.locator(`nav.sheet-tabs a[data-tab="${tabId}"].active`).waitFor({ state: 'attached' });
            await expect(sheet.locator(`.tab[data-tab="${tabId}"]`)).toHaveScreenshot(`operative-tab-${tabId}.png`);
        }
    });

    test('NPC/Threat sheet — each tab', async ({ page }) => {
        const npcId = await page.evaluate(async () => {
            const [actor] = await Actor.createDocuments([
                { name: 'Screenshot NPC', type: 'npc', system: { hp: { value: 10, max: 10 } } }
            ]);
            return actor.id;
        });

        const sheet = await openActorSheet(page, npcId);
        const npcTabs = ['combat', 'inventory', 'effects', 'skills', 'notes'];

        for (const tabId of npcTabs) {
            await clickActorSheetTab(sheet, tabId);
            await sheet.locator(`nav.sheet-tabs a[data-tab="${tabId}"].active`).waitFor({ state: 'attached' });
            await expect(sheet.locator(`.tab[data-tab="${tabId}"]`)).toHaveScreenshot(`npc-tab-${tabId}.png`);
        }
    });

    test('vehicle sheet — full layout', async ({ page }) => {
        const vehicleId = await page.evaluate(async () => {
            const [actor] = await Actor.createDocuments([
                {
                    name: 'Screenshot Vehicle',
                    type: 'vehicle',
                    system: {
                        hp: { value: 10, max: 12 },
                        armor: { pv: 3, resist: { value: 2, max: 4 } },
                        move: { value: 6 },
                        skill: 'Drive: Wheeled'
                    }
                }
            ]);
            return actor.id;
        });

        const sheet = await openActorSheet(page, vehicleId);
        await expect(sheet).toHaveScreenshot('vehicle-sheet-full.png');
    });
});
