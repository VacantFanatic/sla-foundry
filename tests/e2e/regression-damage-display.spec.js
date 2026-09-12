/**
 * E2E coverage for module/helpers/chat/damage.mjs::resolveDamageDisplay --
 * the Foundry-dependent formula-to-display-value resolver used by the
 * TN-adjustment and damage-roll chat card rebuilds. Its sibling
 * resolveSheetDamageDisplay (sheet-helpers.mjs) is covered in
 * regression-sheet-helpers.spec.js; this is a distinct exported entry
 * point in a different module and was itself untested.
 */
const { test, expect } = require('@playwright/test');
const { joinGame, waitForSLASystem } = require('./fixtures');

const needsAuth = () => {
    test.skip(!process.env.FOUNDRY_USER, 'Set FOUNDRY_USER (and FOUNDRY_URL / FOUNDRY_PASSWORD if needed)');
};

test.describe('resolveDamageDisplay (document API)', () => {
    test.beforeEach(async ({ page }) => {
        needsAuth();
        await joinGame(page);
        await waitForSLASystem(page);
    });

    test('passes dice formulas through, resolves flat math, and falls back on invalid expressions', async ({
        page
    }) => {
        const result = await page.evaluate(async () => {
            const { resolveDamageDisplay } = await import('/systems/sla-industries/module/helpers/chat/damage.mjs');
            return {
                empty: resolveDamageDisplay(''),
                zero: resolveDamageDisplay('0'),
                dice: resolveDamageDisplay('3d10 + 1'),
                flatMath: resolveDamageDisplay('4 + 6'),
                invalidExpression: resolveDamageDisplay('not a formula at all')
            };
        });

        expect(result.empty).toBe('0');
        expect(result.zero).toBe('0');
        expect(result.dice).toBe('3d10 + 1');
        expect(result.flatMath).toBe('10');
        expect(result.invalidExpression).toBe('not a formula at all');
    });
});
