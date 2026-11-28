/**
 * E2E coverage for the Heal discipline's chat-card buttons (issue #421). Each case mirrors a
 * rulebook entry, casts it through the real executeEbbRoll (so the real chat-weapon-rolls.hbs card
 * is rendered), and clicks the rendered buttons in the chat sidebar rather than calling a handler
 * directly -- a hand-built click can't prove the template actually emits the control.
 */
const { test, expect } = require('@playwright/test');
const { joinGame, waitForSLASystem, dismissFoundryNotifications } = require('./fixtures');

const needsAuth = () => {
    test.skip(!process.env.FOUNDRY_USER, 'Set FOUNDRY_USER (and FOUNDRY_URL / FOUNDRY_PASSWORD if needed)');
};

/**
 * Creates a wounded, damaged caster plus a Heal formula, then casts it with a large situational
 * modifier so the roll always succeeds. Resolves to ids the test needs to find the card.
 */
async function castHealFormula(page, name, formulaSystem) {
    return page.evaluate(
        async ({ name, formulaSystem }) => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([
                {
                    name: `E2E Heal ${name} ${stamp}`,
                    type: 'character',
                    system: {
                        stats: { flux: { value: 5, max: 6 } },
                        hp: { value: 2, max: 20 },
                        wounds: { torso: true, head: true }
                    }
                }
            ]);
            await actor.createEmbeddedDocuments('Item', [
                { name: `E2E Heal Discipline ${stamp}`, type: 'discipline', system: { rank: 0 } }
            ]);
            const [formula] = await actor.createEmbeddedDocuments('Item', [
                {
                    name: `E2E ${name} ${stamp}`,
                    type: 'ebbFormula',
                    system: {
                        cost: 1,
                        formulaRating: 7,
                        discipline: `E2E Heal Discipline ${stamp}`,
                        ...formulaSystem
                    }
                }
            ]);

            const { generateSheetTooltip, resolveSheetDamageDisplay, buildSlaRollFlags } =
                await import('/systems/sla-industries/module/sheets/actor/sheet-helpers.mjs');
            const sheet = {
                actor,
                _generateTooltip: (roll, mod, sdMod) => generateSheetTooltip(roll, mod, sdMod),
                _resolveDamageDisplay: (f) => resolveSheetDamageDisplay(f, actor),
                _buildSlaRollFlags: (params) => buildSlaRollFlags(params)
            };
            const { executeEbbRoll } = await import('/systems/sla-industries/module/sheets/actor/ebb-rolls.mjs');
            await executeEbbRoll(sheet, formula, { situationalModifier: 50 });

            const message = [...game.messages].reverse().find((m) => m.flags?.sla?.itemUuid === formula.uuid);
            return { actorId: actor.id, messageId: message?.id, success: message?.flags?.sla?.ebbRollSuccess };
        },
        { name, formulaSystem }
    );
}

const readActor = (page, actorId) =>
    page.evaluate((id) => {
        const a = game.actors.get(id);
        const wounds = a.system.wounds;
        return {
            hp: a.system.hp.value,
            woundCount: ['head', 'lArm', 'rArm', 'torso', 'lLeg', 'rLeg'].filter((k) => wounds[k]).length
        };
    }, actorId);

const cleanup = (page, actorId) => page.evaluate((id) => game.actors.get(id)?.delete(), actorId);

async function openChatCard(page, messageId) {
    // The sidebar starts collapsed; a card inside it is outside the viewport and cannot be clicked.
    await page.evaluate(() => {
        ui.sidebar?.expand?.();
        ui.sidebar?.changeTab?.('chat', 'primary');
    });
    const card = page.locator(`#chat .chat-message[data-message-id="${messageId}"]`);
    await expect(card).toBeVisible({ timeout: 15_000 });
    return card;
}

test.describe('GM: Ebb Heal discipline chat cards', () => {
    test.beforeEach(async ({ page }) => {
        needsAuth();
        await joinGame(page);
        await waitForSLASystem(page);
        await dismissFoundryNotifications(page);
        const gm = await page.evaluate(() => game.user?.isGM === true);
        test.skip(!gm, 'Requires GM — use a Gamemaster account for FOUNDRY_USER');
    });

    test('Rank 1 Heal Wound (#421): the card shows Remove Wounds and clicking it removes one wound', async ({
        page
    }) => {
        const { actorId, messageId, success } = await castHealFormula(page, 'Heal Wound', {
            ebbTarget: 'self',
            ebbEffect: 'heal',
            ebbHealWoundMode: 'or',
            removeWounds: 1,
            damage: '',
            minDamage: ''
        });
        expect(success).toBe(true);

        const card = await openChatCard(page, messageId);
        const removeBtn = card.locator('.sla-ebb-remove-wounds-btn');
        await expect(removeBtn).toBeVisible();
        await expect(card.locator('.damage-roll')).toHaveCount(0);

        await removeBtn.click();
        await expect.poll(async () => (await readActor(page, actorId)).woundCount).toBe(1);
        expect((await readActor(page, actorId)).hp).toBe(2);
        await cleanup(page, actorId);
    });

    test('Rank 1 Heal Injury: only the heal roll is offered and it heals the caster', async ({ page }) => {
        const { actorId, messageId } = await castHealFormula(page, 'Heal Injury', {
            ebbTarget: 'self',
            ebbEffect: 'heal',
            removeWounds: 0,
            damage: '3'
        });

        const card = await openChatCard(page, messageId);
        await expect(card.locator('.sla-ebb-remove-wounds-btn')).toHaveCount(0);
        await card.locator('.damage-roll').click();
        await expect.poll(async () => (await readActor(page, actorId)).hp).toBe(5);
        expect((await readActor(page, actorId)).woundCount).toBe(2);
        await cleanup(page, actorId);
    });

    test('Rank 2 Healing Touch ("or"): offers heal and Remove Wounds; using one locks the other', async ({ page }) => {
        const { actorId, messageId } = await castHealFormula(page, 'Healing Touch', {
            ebbTarget: 'self',
            ebbEffect: 'heal',
            ebbHealWoundMode: 'or',
            removeWounds: 1,
            damage: '3'
        });

        const card = await openChatCard(page, messageId);
        await expect(card.locator('.damage-roll')).toBeVisible();
        const removeBtn = card.locator('.sla-ebb-remove-wounds-btn');
        await expect(removeBtn).toBeVisible();

        await removeBtn.click();
        await expect.poll(async () => (await readActor(page, actorId)).woundCount).toBe(1);
        await expect(card.locator('.damage-roll')).toBeDisabled();
        expect((await readActor(page, actorId)).hp).toBe(2);
        await cleanup(page, actorId);
    });

    test('Rank 3 Advanced Heal ("and"): one heal roll that also removes the wound', async ({ page }) => {
        const { actorId, messageId } = await castHealFormula(page, 'Advanced Heal', {
            ebbTarget: 'self',
            ebbEffect: 'heal',
            ebbHealWoundMode: 'and',
            removeWounds: 1,
            damage: '6'
        });

        const card = await openChatCard(page, messageId);
        await expect(card.locator('.sla-ebb-remove-wounds-btn')).toHaveCount(0);
        await card.locator('.damage-roll').click();
        await expect.poll(async () => (await readActor(page, actorId)).hp).toBe(8);
        expect((await readActor(page, actorId)).woundCount).toBe(1);
        await cleanup(page, actorId);
    });

    test('Rank 2 Poison Leech (effect, no numbers): no HP or wound buttons', async ({ page }) => {
        const { actorId, messageId } = await castHealFormula(page, 'Poison Leech', {
            ebbTarget: 'self',
            ebbEffect: 'effect',
            removeWounds: 0,
            damage: ''
        });

        const card = await openChatCard(page, messageId);
        await expect(card.locator('.damage-roll')).toHaveCount(0);
        await expect(card.locator('.sla-ebb-remove-wounds-btn')).toHaveCount(0);
        await cleanup(page, actorId);
    });
});
