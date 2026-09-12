/**
 * E2E coverage for module/sheets/actor/ebb-rolls.mjs::executeEbbRoll -- the
 * Ebb-formula cast orchestrator. It gates on/deducts system.stats.flux.value
 * (a resource spend with an insufficient-flux guard), resolves the caster's
 * discipline rank, and was previously entirely untested. Calls it directly
 * with a minimal sheet stub exposing only the two methods it delegates to
 * (both thin wrappers around already-unit-tested sheet-helpers.mjs functions).
 */
const { test, expect } = require('@playwright/test');
const { joinGame, waitForSLASystem } = require('./fixtures');

const needsAuth = () => {
    test.skip(!process.env.FOUNDRY_USER, 'Set FOUNDRY_USER (and FOUNDRY_URL / FOUNDRY_PASSWORD if needed)');
};

test.describe('GM: executeEbbRoll (document API)', () => {
    test.beforeEach(async ({ page }) => {
        needsAuth();
        await joinGame(page);
        await waitForSLASystem(page);
        const gm = await page.evaluate(() => game.user?.isGM === true);
        test.skip(!gm, 'Requires GM — use a Gamemaster account for FOUNDRY_USER');
    });

    test('refuses to cast and leaves flux untouched when flux is insufficient', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([
                { name: `E2E Ebb NoFlux ${stamp}`, type: 'character', system: { stats: { flux: { value: 0 } } } }
            ]);
            const [formula] = await actor.createEmbeddedDocuments('Item', [
                { name: `E2E Formula ${stamp}`, type: 'ebbFormula', system: { cost: 2, discipline: 'Blast' } }
            ]);

            const { generateSheetTooltip, resolveSheetDamageDisplay } =
                await import('/systems/sla-industries/module/sheets/actor/sheet-helpers.mjs');
            const sheet = {
                actor,
                _generateTooltip: (roll, mod, sdMod) => generateSheetTooltip(roll, mod, sdMod),
                _resolveDamageDisplay: (formula) => resolveSheetDamageDisplay(formula, actor)
            };

            const { executeEbbRoll } = await import('/systems/sla-industries/module/sheets/actor/ebb-rolls.mjs');
            await executeEbbRoll(sheet, formula);

            const persistedFlux = game.actors.get(actor.id).system.stats.flux.value;
            await actor.delete();
            return persistedFlux;
        });

        expect(result).toBe(0);
    });

    test('deducts flux and casts against a matching discipline item', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([
                { name: `E2E Ebb Cast ${stamp}`, type: 'character', system: { stats: { flux: { value: 5 } } } }
            ]);
            await actor.createEmbeddedDocuments('Item', [
                { name: `E2E Blast Discipline ${stamp}`, type: 'discipline', system: { rank: 2 } }
            ]);
            // resolveEbbDisciplineName falls back to the raw string when CONFIG.SLA.ebbDisciplines
            // has no matching key, so the formula's discipline text must match the item's name.
            const [formula] = await actor.createEmbeddedDocuments('Item', [
                {
                    name: `E2E Formula Cast ${stamp}`,
                    type: 'ebbFormula',
                    system: { cost: 2, formulaRating: 7, discipline: `E2E Blast Discipline ${stamp}`, damage: '1d10' }
                }
            ]);

            const messageCountBefore = game.messages.size;

            const { generateSheetTooltip, resolveSheetDamageDisplay } =
                await import('/systems/sla-industries/module/sheets/actor/sheet-helpers.mjs');
            const sheet = {
                actor,
                _generateTooltip: (roll, mod, sdMod) => generateSheetTooltip(roll, mod, sdMod),
                _resolveDamageDisplay: (formula) => resolveSheetDamageDisplay(formula, actor)
            };

            const { executeEbbRoll } = await import('/systems/sla-industries/module/sheets/actor/ebb-rolls.mjs');
            await executeEbbRoll(sheet, formula);

            const fresh = game.actors.get(actor.id);
            const persistedFlux = fresh.system.stats.flux.value;
            const messageCountAfter = game.messages.size;

            await actor.delete();
            return { persistedFlux, messagePosted: messageCountAfter > messageCountBefore };
        });

        expect(result.persistedFlux).toBe(3);
        expect(result.messagePosted).toBe(true);
    });

    test('deducts flux even when no matching discipline item exists (current behavior)', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([
                { name: `E2E Ebb NoDiscipline ${stamp}`, type: 'character', system: { stats: { flux: { value: 5 } } } }
            ]);
            const [formula] = await actor.createEmbeddedDocuments('Item', [
                {
                    name: `E2E Formula Orphan ${stamp}`,
                    type: 'ebbFormula',
                    system: { cost: 2, discipline: 'Nonexistent' }
                }
            ]);

            const { generateSheetTooltip, resolveSheetDamageDisplay } =
                await import('/systems/sla-industries/module/sheets/actor/sheet-helpers.mjs');
            const sheet = {
                actor,
                _generateTooltip: (roll, mod, sdMod) => generateSheetTooltip(roll, mod, sdMod),
                _resolveDamageDisplay: (formula) => resolveSheetDamageDisplay(formula, actor)
            };

            const { executeEbbRoll } = await import('/systems/sla-industries/module/sheets/actor/ebb-rolls.mjs');
            await executeEbbRoll(sheet, formula);

            const persistedFlux = game.actors.get(actor.id).system.stats.flux.value;
            await actor.delete();
            return persistedFlux;
        });

        // Flux is spent before the discipline lookup in the current implementation, so this
        // documents the real (if perhaps surprising) order of operations rather than an ideal one.
        expect(result).toBe(3);
    });
});
