/**
 * Capture actor sheet screenshots for UX review.
 * Output: test-results/sheet-screenshots/*.png
 */
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('@playwright/test');
const {
    joinGame,
    waitForSLASystem,
    dismissFoundryNotifications,
    createTestActor,
    openActorSheet,
    clickActorSheetTab,
    deleteTestActors,
    closeApplicationWindows
} = require('./fixtures');

const OUT_DIR = path.join(process.cwd(), 'test-results', 'sheet-screenshots');
const ARTIFACT_DIR = '/opt/cursor/artifacts/screenshots';

function outputDirs() {
    const dirs = [OUT_DIR];
    try {
        fs.mkdirSync(path.dirname(ARTIFACT_DIR), { recursive: true });
        dirs.push(ARTIFACT_DIR);
    } catch {
        /* optional path */
    }
    return dirs;
}

async function saveShot(locator, name) {
    for (const dir of outputDirs()) {
        fs.mkdirSync(dir, { recursive: true });
        await locator.screenshot({ path: path.join(dir, `${name}.png`) });
    }
}

test.describe.configure({ timeout: 180_000 });

test.describe('Actor sheet screenshot capture', () => {
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
        await deleteTestActors(page);
        await page
            .evaluate(async () => {
                for (const actor of game.actors.filter((a) => a.name?.startsWith('Screenshot '))) {
                    await actor.delete();
                }
            })
            .catch(() => {});
        await closeApplicationWindows(page);
    });

    test('capture operative sheet — all tabs and density regions', async ({ page }) => {
        const actorId = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([
                {
                    name: `Screenshot Operative ${stamp}`,
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

        await saveShot(sheet.locator('.sheet-header'), '02-operative-header');
        await saveShot(sheet.locator('.stats-strip-container'), '03-operative-stats-strip');
        await saveShot(sheet.locator('nav.sla-sheet-tab-rail'), '04-operative-tab-rail');

        for (const tabId of operativeTabs) {
            await clickActorSheetTab(sheet, tabId);
            await sheet.locator(`nav.sheet-tabs a[data-tab="${tabId}"].active`).waitFor({ state: 'attached' });
            await saveShot(sheet, `tab-${tabId}-full`);
        }

        await clickActorSheetTab(sheet, 'combat');
        const woundPanel = sheet.locator('.sla-wound-panel');
        if ((await woundPanel.count()) > 0) {
            await saveShot(woundPanel, '05-operative-wounds-conditions');
        }

        await clickActorSheetTab(sheet, 'main');
        const vitalsCol = sheet.locator('.right-col');
        if ((await vitalsCol.count()) > 0) {
            await saveShot(vitalsCol, '07-operative-vitals-xp');
        }

        await clickActorSheetTab(sheet, 'effects');
        const effectsHeader = sheet.locator('.sla-effects-panel > .sla-header-bar');
        if ((await effectsHeader.count()) > 0) {
            await saveShot(effectsHeader, '08-operative-effects-header');
        }
        await saveShot(sheet.locator('.sla-effects-panel'), '08-operative-effects-panel');
    });

    test('capture NPC threat sheet — all tabs', async ({ page }) => {
        const npcId = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([
                { name: `Screenshot NPC ${stamp}`, type: 'npc', system: { hp: { value: 10, max: 10 } } }
            ]);
            return actor.id;
        });

        const sheet = await openActorSheet(page, npcId);
        const npcTabs = ['combat', 'inventory', 'effects', 'skills', 'notes'];

        for (const tabId of npcTabs) {
            await clickActorSheetTab(sheet, tabId);
            await sheet.locator(`nav.sheet-tabs a[data-tab="${tabId}"].active`).waitFor({ state: 'attached' });
            await saveShot(sheet, `npc-tab-${tabId}-full`);
        }
    });
});
