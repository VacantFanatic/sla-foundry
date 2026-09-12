/**
 * E2E coverage for module/migration.mjs's migrateTo200/migrateTo210 steps
 * (exported specifically to make them directly testable -- see
 * CLAUDE.md's Lessons learned). The full migrateWorld() orchestrator is
 * intentionally NOT invoked here: by default it downloads a real JSON world
 * backup via foundry.utils.saveDataToFile() (enableMigrationWorldBackup
 * defaults to true) and touches every actor/item in the shared test world,
 * neither of which is safe to trigger from an automated test.
 *
 * These two steps only rewrite documents whose stored data predates the
 * current schema (undefined/null HTML fields, legacy drug system.mods/
 * system.damageReduction keys) -- constructing that legacy precondition
 * would mean bypassing Document validation in a way that can't be verified
 * against a live instance, so these tests confirm the safe, always-true
 * property instead: both steps run cleanly against normally-created,
 * already-current-shape documents without throwing or rewriting anything.
 */
const { test, expect } = require('@playwright/test');
const { joinGame, waitForSLASystem } = require('./fixtures');

const needsAuth = () => {
    test.skip(!process.env.FOUNDRY_USER, 'Set FOUNDRY_USER (and FOUNDRY_URL / FOUNDRY_PASSWORD if needed)');
};

test.describe('GM: migrateTo200 / migrateTo210 (document API)', () => {
    test.beforeEach(async ({ page }) => {
        needsAuth();
        await joinGame(page);
        await waitForSLASystem(page);
        const gm = await page.evaluate(() => game.user?.isGM === true);
        test.skip(!gm, 'Requires GM — use a Gamemaster account for FOUNDRY_USER');
    });

    test('migrateTo200 is a safe no-op against a normally-created actor and item', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([{ name: `E2E Migration 200 ${stamp}`, type: 'character' }]);
            const [item] = await Item.createDocuments([{ name: `E2E Migration Item ${stamp}`, type: 'item' }]);

            const before = { biography: actor.system.biography, description: item.system.description };

            const { migrateTo200 } = await import('/systems/sla-industries/module/migration.mjs');
            await migrateTo200();

            const after = {
                biography: game.actors.get(actor.id).system.biography,
                description: game.items.get(item.id).system.description
            };

            await actor.delete();
            await item.delete();
            return { before, after };
        });

        expect(result.after).toEqual(result.before);
    });

    test('migrateTo210 is a safe no-op against a normally-created drug item', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([{ name: `E2E Migration 210 ${stamp}`, type: 'character' }]);
            const [drug] = await actor.createEmbeddedDocuments('Item', [
                { name: `E2E Migration Drug ${stamp}`, type: 'drug', system: { quantity: 1 } }
            ]);

            const before = actor.items.get(drug.id).system.quantity;

            const { migrateTo210 } = await import('/systems/sla-industries/module/migration.mjs');
            await migrateTo210();

            const after = game.actors.get(actor.id).items.get(drug.id).system.quantity;
            await actor.delete();
            return { before, after };
        });

        expect(result.after).toBe(result.before);
    });
});
