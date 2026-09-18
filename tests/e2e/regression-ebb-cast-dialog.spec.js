/**
 * E2E coverage for module/sheets/actor/ebb-rolls.mjs::renderEbbCastDialog -- the pre-roll
 * confirmation dialog for Ebb Discipline casts (GitHub issue #380). Renders the real
 * templates/dialogs/ebb-cast-dialog.hbs template and clicks the real confirm button rather than
 * hand-building DOM or calling executeEbbRoll directly, per this repo's CLAUDE.md lesson (the
 * #363 -> #369 Gear-toggle regression, where a hand-built .item-toggle element proved the click
 * handler worked but never caught that the real template didn't emit the control at all).
 */
const { test, expect } = require('@playwright/test');
const { joinGame, waitForSLASystem } = require('./fixtures');

const needsAuth = () => {
    test.skip(!process.env.FOUNDRY_USER, 'Set FOUNDRY_USER (and FOUNDRY_URL / FOUNDRY_PASSWORD if needed)');
};

test.describe('GM: renderEbbCastDialog (rendered UI)', () => {
    test.beforeEach(async ({ page }) => {
        needsAuth();
        await joinGame(page);
        await waitForSLASystem(page);
        const gm = await page.evaluate(() => game.user?.isGM === true);
        test.skip(!gm, 'Requires GM — use a Gamemaster account for FOUNDRY_USER');
    });

    test('shows a situational-modifier input and applies it to the roll on confirm', async ({ page }) => {
        // Rendering a real ApplicationV2 dialog + a full roll/chat-render round trip is slower
        // than the default 30s budget in this sandbox's software-rendered Chromium.
        test.setTimeout(60_000);
        const stamp = Date.now();

        const setup = await page.evaluate(async (stamp) => {
            const [actor] = await Actor.createDocuments([
                {
                    name: `E2E Ebb Dialog ${stamp}`,
                    type: 'character',
                    system: { stats: { flux: { value: 5, max: 6 }, conc: { value: 0 } } }
                }
            ]);
            await actor.createEmbeddedDocuments('Item', [
                { name: `E2E Dialog Discipline ${stamp}`, type: 'discipline', system: { rank: 0 } }
            ]);
            const [formula] = await actor.createEmbeddedDocuments('Item', [
                {
                    name: `E2E Formula Dialog ${stamp}`,
                    type: 'ebbFormula',
                    system: { cost: 2, formulaRating: 7, discipline: `E2E Dialog Discipline ${stamp}`, damage: '0' }
                }
            ]);

            const { generateSheetTooltip, resolveSheetDamageDisplay, buildSlaRollFlags } =
                await import('/systems/sla-industries/module/sheets/actor/sheet-helpers.mjs');
            const sheet = {
                actor,
                _generateTooltip: (roll, mod, sdMod) => generateSheetTooltip(roll, mod, sdMod),
                _resolveDamageDisplay: (formula) => resolveSheetDamageDisplay(formula, actor),
                _buildSlaRollFlags: (params) => buildSlaRollFlags(params)
            };
            window.__e2eEbbDialogSheet = sheet;
            window.__e2eEbbDialogFormula = formula;
            window.__e2eEbbDialogMessagesBefore = game.messages.size;

            const { renderEbbCastDialog } = await import('/systems/sla-industries/module/sheets/actor/ebb-rolls.mjs');
            await renderEbbCastDialog(sheet, formula);

            return { actorId: actor.id, formulaId: formula.id };
        }, stamp);

        // The dialog is a real rendered ApplicationV2 window -- find its input in the live DOM.
        const modifierInput = page.locator('input[name="situationalModifier"]');
        await expect(modifierInput).toBeVisible();
        await modifierInput.fill('3');

        const confirmButton = page.locator('[data-action="confirmDialog"]');
        await expect(confirmButton).toBeVisible();
        await confirmButton.click();

        // Wait for the roll to post (executeEbbRoll is async, dialog closes immediately on confirm).
        await page.waitForFunction(
            (before) => game.messages.size > before,
            (await page.evaluate(() => window.__e2eEbbDialogMessagesBefore)) ?? 0
        );

        const result = await page.evaluate(async () => {
            const message = [...game.messages].pop();
            const actor = game.actors.get(window.__e2eEbbDialogSheet.actor.id);
            const persistedFlux = actor.system.stats.flux.value;
            await actor.delete();
            return {
                baseModifier: message?.flags?.sla?.baseModifier,
                notes: message?.flags?.sla?.notes,
                persistedFlux
            };
        });

        // statValue(0) + rank(0) - woundPenalty(0) + globalMod(0) + rollModifier(0 + 3) === 3
        expect(result.baseModifier).toBe(3);
        expect(result.notes).toContain('Situational Modifier (+3)');
        expect(result.persistedFlux).toBe(3);
    });
});
