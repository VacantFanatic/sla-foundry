/**
 * E2E coverage for module/sheets/actor/ebb-rolls.mjs::executeEbbRoll -- the
 * Ebb-formula cast orchestrator. It gates on/deducts system.stats.flux.value
 * (a resource spend with an insufficient-flux guard), resolves the caster's
 * discipline rank, and was previously entirely untested. Calls it directly
 * with a minimal sheet stub exposing only the methods it delegates to
 * (all thin wrappers around already-unit-tested sheet-helpers.mjs functions).
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

            const { generateSheetTooltip, resolveSheetDamageDisplay, buildSlaRollFlags } =
                await import('/systems/sla-industries/module/sheets/actor/sheet-helpers.mjs');
            const sheet = {
                actor,
                _generateTooltip: (roll, mod, sdMod) => generateSheetTooltip(roll, mod, sdMod),
                _resolveDamageDisplay: (formula) => resolveSheetDamageDisplay(formula, actor),
                _buildSlaRollFlags: (params) => buildSlaRollFlags(params)
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
                { name: `E2E Ebb Cast ${stamp}`, type: 'character', system: { stats: { flux: { value: 5, max: 6 } } } }
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

            const { generateSheetTooltip, resolveSheetDamageDisplay, buildSlaRollFlags } =
                await import('/systems/sla-industries/module/sheets/actor/sheet-helpers.mjs');
            const sheet = {
                actor,
                _generateTooltip: (roll, mod, sdMod) => generateSheetTooltip(roll, mod, sdMod),
                _resolveDamageDisplay: (formula) => resolveSheetDamageDisplay(formula, actor),
                _buildSlaRollFlags: (params) => buildSlaRollFlags(params)
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
                {
                    name: `E2E Ebb NoDiscipline ${stamp}`,
                    type: 'character',
                    system: { stats: { flux: { value: 5, max: 6 } } }
                }
            ]);
            const [formula] = await actor.createEmbeddedDocuments('Item', [
                {
                    name: `E2E Formula Orphan ${stamp}`,
                    type: 'ebbFormula',
                    system: { cost: 2, discipline: 'Nonexistent' }
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

    test('applies a positive situational modifier (e.g. MOS-3 reuse) to the roll and chat notes', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([
                {
                    name: `E2E Ebb ReuseMod ${stamp}`,
                    type: 'character',
                    system: { stats: { flux: { value: 5, max: 6 }, conc: { value: 0 } } }
                }
            ]);
            await actor.createEmbeddedDocuments('Item', [
                { name: `E2E ReuseMod Discipline ${stamp}`, type: 'discipline', system: { rank: 0 } }
            ]);
            const [formula] = await actor.createEmbeddedDocuments('Item', [
                {
                    name: `E2E Formula ReuseMod ${stamp}`,
                    type: 'ebbFormula',
                    system: { cost: 2, formulaRating: 7, discipline: `E2E ReuseMod Discipline ${stamp}`, damage: '0' }
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

            const { executeEbbRoll } = await import('/systems/sla-industries/module/sheets/actor/ebb-rolls.mjs');

            const messagesBefore = game.messages.size;
            await executeEbbRoll(sheet, formula, { situationalModifier: 3 });
            const messagesAfter = game.messages.size;
            const message = [...game.messages].pop();

            await actor.delete();
            return {
                messagePosted: messagesAfter > messagesBefore,
                baseModifier: message?.flags?.sla?.baseModifier,
                notes: message?.flags?.sla?.notes
            };
        });

        expect(result.messagePosted).toBe(true);
        // statValue(0) + rank(0) - woundPenalty(0) + globalMod(0) + rollModifier(0 + 3) === 3
        expect(result.baseModifier).toBe(3);
        expect(result.notes).toContain('Situational Modifier (+3)');
    });

    test('applies a negative situational modifier (e.g. choking) to the roll and chat notes', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([
                {
                    name: `E2E Ebb ChokeMod ${stamp}`,
                    type: 'character',
                    system: { stats: { flux: { value: 5, max: 6 }, conc: { value: 0 } } }
                }
            ]);
            await actor.createEmbeddedDocuments('Item', [
                { name: `E2E ChokeMod Discipline ${stamp}`, type: 'discipline', system: { rank: 0 } }
            ]);
            const [formula] = await actor.createEmbeddedDocuments('Item', [
                {
                    name: `E2E Formula ChokeMod ${stamp}`,
                    type: 'ebbFormula',
                    system: { cost: 2, formulaRating: 7, discipline: `E2E ChokeMod Discipline ${stamp}`, damage: '0' }
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

            const { executeEbbRoll } = await import('/systems/sla-industries/module/sheets/actor/ebb-rolls.mjs');
            await executeEbbRoll(sheet, formula, { situationalModifier: -2 });
            const message = [...game.messages].pop();

            await actor.delete();
            return {
                baseModifier: message?.flags?.sla?.baseModifier,
                notes: message?.flags?.sla?.notes
            };
        });

        expect(result.baseModifier).toBe(-2);
        expect(result.notes).toContain('Situational Modifier (-2)');
    });
});
