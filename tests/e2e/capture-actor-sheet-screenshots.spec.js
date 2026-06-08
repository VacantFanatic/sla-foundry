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

test.describe.configure({ timeout: 90_000 });

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

    test('capture operative sheet regions', async ({ page }) => {
        const actorId = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([
                {
                    name: `Screenshot Operative ${stamp}`,
                    type: 'character',
                    system: {
                        stats: { str: { value: 4 }, dex: { value: 3 }, init: { value: 22 } },
                        hp: { value: 22, max: 30 },
                        finance: { credits: 1820, unis: 0, debt: 0 },
                        wounds: { head: false, torso: false, lArm: true, rArm: false, lLeg: false, rLeg: false }
                    }
                }
            ]);
            return actor.id;
        });

        const sheet = await openActorSheet(page, actorId);

        await saveShot(sheet, '01-operative-sheet');
        await saveShot(sheet.locator('.sheet-header'), '02-operative-header');
        await saveShot(sheet.locator('.stats-strip-container'), '03-operative-stats-strip');
        await saveShot(sheet.locator('nav.sla-sheet-tab-rail'), '04-operative-tab-rail');

        await clickActorSheetTab(sheet, 'combat');
        await saveShot(sheet.locator('.tab[data-tab="combat"] .sla-panel').first(), '05-operative-wounds');
        if ((await sheet.locator('.sla-combat-loadout').count()) > 0) {
            await saveShot(sheet.locator('.sla-combat-loadout'), '06-operative-combat-loadout');
        }

        await clickActorSheetTab(sheet, 'main');
        if ((await sheet.locator('.right-col').count()) > 0) {
            await saveShot(sheet.locator('.right-col'), '07-operative-vitals');
        }
    });

    test('capture NPC threat sheet', async ({ page }) => {
        const npcId = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([
                { name: `Screenshot NPC ${stamp}`, type: 'npc', system: { hp: { value: 10, max: 10 } } }
            ]);
            return actor.id;
        });

        await page.evaluate(async (id) => {
            const actor = game.actors.get(id);
            await actor.sheet.render(true);
        }, npcId);

        const sheet = page.locator('form.application.sla-industries.actor').last();
        await sheet.waitFor({ state: 'visible' });
        await saveShot(sheet, '08-npc-threat-sheet');
    });
});
