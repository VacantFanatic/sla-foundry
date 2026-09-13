const { test, expect } = require('@playwright/test');
const { joinGame, waitForSLASystem, dismissFoundryNotifications } = require('./fixtures');

const needsAuth = () => {
    test.skip(!process.env.FOUNDRY_USER, 'Set FOUNDRY_USER (and FOUNDRY_URL / FOUNDRY_PASSWORD if needed)');
};

test.describe('SLA regression — authenticated', () => {
    test.beforeEach(async ({ page }) => {
        needsAuth();
        await joinGame(page);
        await waitForSLASystem(page);
        await page.evaluate(() => {
            if (globalThis.game?.paused) globalThis.game.togglePause();
        });
    });

    test('game.system is sla-industries with expected version shape', async ({ page }) => {
        const info = await page.evaluate(() => ({
            id: game.system?.id,
            version: game.system?.version
        }));
        expect(info.id).toBe('sla-industries');
        expect(info.version).toMatch(/^\d+\.\d+\.\d+/);
    });

    test('game.sla exposes movement and hotbar API', async ({ page }) => {
        const api = await page.evaluate(() => ({
            rollOwnedItem: typeof game.sla?.rollOwnedItem,
            addActorItemToHotbar: typeof game.sla?.addActorItemToHotbar,
            canTokenMoveThisTurn: typeof game.sla?.canTokenMoveThisTurn
        }));
        expect(api.rollOwnedItem).toBe('function');
        expect(api.addActorItemToHotbar).toBe('function');
        expect(api.canTokenMoveThisTurn).toBe('function');
    });

    test('world setting systemMigrationVersion is semver-like', async ({ page }) => {
        const v = await page.evaluate(() => game.settings.get('sla-industries', 'systemMigrationVersion'));
        expect(v).toMatch(/^\d+\.\d+\.\d+/);
    });

    test('boolean world settings are readable', async ({ page }) => {
        const keys = [
            'enableCombatMovementLock',
            'enableExplosiveThrowAutomation',
            'enableMigrationWorldBackup',
            'ammoReloadNoticeShown'
        ];
        const ok = await page.evaluate((settingKeys) => {
            return settingKeys.every((k) => typeof game.settings.get('sla-industries', k) === 'boolean');
        }, keys);
        expect(ok).toBe(true);
    });

    test('blast region visibility world setting is registered', async ({ page }) => {
        const mode = await page.evaluate(() => game.settings.get('sla-industries', 'blastRegionVisibility'));
        expect(['observer', 'always']).toContain(mode);
    });

    test('Foundry v14+ Active Effect change types are available (effect stack smoke)', async ({ page }) => {
        const ok = await page.evaluate(() => {
            const t = globalThis.CONST?.ACTIVE_EFFECT_CHANGE_TYPES;
            const add = t?.add ?? t?.ADD;
            return Boolean(t && typeof t === 'object' && add !== undefined && add !== null);
        });
        expect(ok).toBe(true);
    });

    test('SlaActor and SlaItem are registered with legacy aliases', async ({ page }) => {
        const classes = await page.evaluate(() => ({
            slaActor: globalThis.game?.sla?.SlaActor?.name,
            slaItem: globalThis.game?.sla?.SlaItem?.name,
            legacyActor: globalThis.game?.boilerplate?.BoilerplateActor?.name,
            legacyItem: globalThis.game?.boilerplate?.BoilerplateItem?.name,
            configActor: globalThis.CONFIG?.Actor?.documentClass?.name,
            configItem: globalThis.CONFIG?.Item?.documentClass?.name
        }));
        expect(classes.slaActor).toBe('SlaActor');
        expect(classes.slaItem).toBe('SlaItem');
        expect(classes.legacyActor).toBe('SlaActor');
        expect(classes.legacyItem).toBe('SlaItem');
        expect(classes.configActor).toBe('SlaActor');
        expect(classes.configItem).toBe('SlaItem');
    });

    // Foundry shows a persistent "screen resolution too small" warning toast below its own
    // minimum supported resolution, and that toast — rendered into `#notifications`, the same
    // container `dismissFoundryNotifications()` already clears — intercepts pointer events for
    // anything behind it. It can (re)appear after the initial dismissal (confirmed live: the SLA
    // Industries button click hangs at the project's actual 1280x720 viewport otherwise), so
    // re-dismiss immediately before that click rather than widening the viewport to route around
    // it — a scoped viewport override was tried first and reproduced the same kind of rendering
    // flakiness documented in CLAUDE.md's viewport lessons-learned entry, even limited to one test.
    test('Configure Settings lists SLA Industries section', async ({ page }) => {
        // More UI round-trips than this file's other tests (4 sequential clicks plus a
        // notification re-check before each) — the default 30s test timeout is too tight here.
        test.setTimeout(60_000);
        await dismissFoundryNotifications(page);
        await page.getByRole('tab', { name: /^settings$/i }).click();
        await dismissFoundryNotifications(page);
        await page.getByRole('button', { name: /^game settings$/i }).click();
        await dismissFoundryNotifications(page);
        await page.getByRole('button', { name: /SLA Industries 2nd Edition/i }).click();
        await dismissFoundryNotifications(page);
        await expect(page.getByText(/Enable Combat Movement Lock/i).first()).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText(/Enable Explosive Throw Automation/i).first()).toBeVisible();
        await expect(page.getByText(/Explosive Blast Region Visibility/i).first()).toBeVisible();
        await page.keyboard.press('Escape');
    });

    // Regression guard: every other setting test reads/writes game.settings directly, bypassing
    // the Configure Settings form entirely — this is the only one that flips a real checkbox in
    // that UI and confirms the value round-trips through game.settings, closing that coverage gap.
    // Restores the original value afterward per the shared-world-state lesson in CLAUDE.md.
    test('Configure Settings — toggling a checkbox persists through game.settings', async ({ page }) => {
        // Same 4-click Settings-navigation chain as the test above (which alone takes ~50s of its
        // 60s budget in CI), plus a checkbox click, Save, and a game.settings poll on top - 60s
        // isn't enough headroom under CI's runner (confirmed: this test failed all 3 attempts on
        // two consecutive main pushes with a clean 60000ms timeout, not an intermittent flake).
        test.setTimeout(120_000);
        const key = 'enableExplosiveThrowAutomation';
        const original = await page.evaluate((k) => game.settings.get('sla-industries', k), key);

        try {
            await dismissFoundryNotifications(page);
            await page.getByRole('tab', { name: /^settings$/i }).click();
            await dismissFoundryNotifications(page);
            await page.getByRole('button', { name: /^game settings$/i }).click();
            await dismissFoundryNotifications(page);
            await page.getByRole('button', { name: /SLA Industries 2nd Edition/i }).click();
            await dismissFoundryNotifications(page);

            const checkbox = page.locator('input[name="sla-industries.enableExplosiveThrowAutomation"]');
            await expect(checkbox).toBeVisible({ timeout: 15_000 });
            // A real click, not .setChecked() — Foundry's category-browser settings form only
            // seems to pick up the state change reliably from an actual click event here.
            await checkbox.click();
            await expect(checkbox).toBeChecked({ checked: !original });
            await page.getByRole('button', { name: /save changes/i }).click();

            await expect
                .poll(async () => page.evaluate((k) => game.settings.get('sla-industries', k), key))
                .toBe(!original);
        } finally {
            await page.evaluate(({ k, v }) => game.settings.set('sla-industries', k, v), { k: key, v: original });
        }
    });

    test('Actors sidebar tab opens directory', async ({ page }) => {
        await page.getByRole('tab', { name: /^actors$/i }).click();
        await expect(page.getByRole('searchbox', { name: /search actors/i })).toBeVisible();
    });
});
