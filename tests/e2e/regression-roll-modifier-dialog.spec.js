/**
 * E2E coverage for the skill / stat-check pre-roll dialog (GitHub issue #422): the
 * "Situational Modifier (+/-)" field. Goes through handleSheetRoll -- the entry point the sheet's
 * roll links use -- and clicks the real confirm button on the real rendered dialog, rather than
 * calling the execute* functions directly (see CLAUDE.md, the #363 -> #369 lesson).
 */
const { test, expect } = require('@playwright/test');
const { confirmRollDialog, joinGame, waitForSLASystem } = require('./fixtures');

const needsAuth = () => {
    test.skip(!process.env.FOUNDRY_USER, 'Set FOUNDRY_USER (and FOUNDRY_URL / FOUNDRY_PASSWORD if needed)');
};

/** Opens the roll dialog via handleSheetRoll for an element built like the sheet's roll links. */
async function openRollDialog(page, { actorName, dataset, withSkill }) {
    return page.evaluate(
        async ({ actorName, dataset, withSkill }) => {
            const [actor] = await Actor.createDocuments([
                {
                    name: actorName,
                    type: 'character',
                    system: { stats: { dex: { value: 4, bonus: 0 }, str: { value: 3, bonus: 0 } } }
                }
            ]);

            const el = document.createElement('button');
            Object.assign(el.dataset, dataset);
            if (withSkill) {
                const [skill] = await actor.createEmbeddedDocuments('Item', [
                    { name: `${actorName} Skill`, type: 'skill', system: { rank: '2', stat: 'dex' } }
                ]);
                const row = document.createElement('div');
                row.className = 'item';
                row.dataset.itemId = skill.id;
                row.appendChild(el);
            }

            const { generateSheetTooltip, resolveSheetDamageDisplay, buildSlaRollFlags } =
                await import('/systems/sla-industries/module/sheets/actor/sheet-helpers.mjs');
            const sheet = {
                actor,
                _generateTooltip: (roll, mod, sdMod) => generateSheetTooltip(roll, mod, sdMod),
                _resolveDamageDisplay: (formula) => resolveSheetDamageDisplay(formula, actor),
                _buildSlaRollFlags: (params) => buildSlaRollFlags(params)
            };
            window.__e2eRollModBefore = game.messages.size;

            const { handleSheetRoll } = await import('/systems/sla-industries/module/sheets/actor/sheet-rolls.mjs');
            await handleSheetRoll(sheet, { preventDefault: () => {}, currentTarget: el });
            return actor.id;
        },
        { actorName, dataset, withSkill }
    );
}

async function readLastRoll(page, actorId) {
    await page.waitForFunction(() => game.messages.size > window.__e2eRollModBefore);
    return page.evaluate(async (id) => {
        const message = [...game.messages].pop();
        await game.actors.get(id)?.delete();
        return { baseModifier: message?.flags?.sla?.baseModifier, notes: message?.flags?.sla?.notes };
    }, actorId);
}

test.describe('GM: skill & stat roll dialog (rendered UI)', () => {
    test.beforeEach(async ({ page }) => {
        needsAuth();
        await joinGame(page);
        await waitForSLASystem(page);
        const gm = await page.evaluate(() => game.user?.isGM === true);
        test.skip(!gm, 'Requires GM — use a Gamemaster account for FOUNDRY_USER');
    });

    test('stat check: the situational modifier is added to the roll and noted on the card', async ({ page }) => {
        test.setTimeout(60_000);
        const actorId = await openRollDialog(page, {
            actorName: `E2E Stat Mod ${Date.now()}`,
            dataset: { rollType: 'stat', key: 'str' }
        });
        await expect(page.locator('input[name="situationalModifier"]').last()).toBeVisible();
        await confirmRollDialog(page, { situationalModifier: -2 });

        const result = await readLastRoll(page, actorId);
        // STR 3, rank 0, no conditions/wounds/Roll Modifier, situational -2
        expect(result.baseModifier).toBe(1);
        expect(result.notes).toContain('Situational Modifier (-2)');
    });

    test('skill roll: the situational modifier is added to the roll and noted on the card', async ({ page }) => {
        test.setTimeout(60_000);
        const actorId = await openRollDialog(page, {
            actorName: `E2E Skill Mod ${Date.now()}`,
            dataset: { rollType: 'skill' },
            withSkill: true
        });
        await confirmRollDialog(page, { situationalModifier: 3 });

        const result = await readLastRoll(page, actorId);
        // DEX 4 + rank 2 + situational 3
        expect(result.baseModifier).toBe(9);
        expect(result.notes).toContain('Situational Modifier (+3)');
    });

    test('a blank modifier rolls unchanged and adds no note', async ({ page }) => {
        test.setTimeout(60_000);
        const actorId = await openRollDialog(page, {
            actorName: `E2E Blank Mod ${Date.now()}`,
            dataset: { rollType: 'stat', key: 'str' }
        });
        await confirmRollDialog(page);

        const result = await readLastRoll(page, actorId);
        expect(result.baseModifier).toBe(3);
        expect(result.notes ?? '').not.toContain('Situational');
    });
});
