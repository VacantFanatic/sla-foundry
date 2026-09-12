/**
 * E2E coverage for inventory stacking (module/helpers/inventory-stack.mjs) and
 * item-linking drop handlers (module/helpers/drop-handlers.mjs). Both write
 * directly to real item/actor documents (system.quantity, system.linkedWeapon,
 * system.skill, system.discipline, system.skills[]) and were previously
 * entirely untested.
 */
const { test, expect } = require('@playwright/test');
const { joinGame, waitForSLASystem } = require('./fixtures');

const needsAuth = () => {
    test.skip(!process.env.FOUNDRY_USER, 'Set FOUNDRY_USER (and FOUNDRY_URL / FOUNDRY_PASSWORD if needed)');
};

test.describe('GM: inventory stacking (document API)', () => {
    test.beforeEach(async ({ page }) => {
        needsAuth();
        await joinGame(page);
        await waitForSLASystem(page);
        const gm = await page.evaluate(() => game.user?.isGM === true);
        test.skip(!gm, 'Requires GM — use a Gamemaster account for FOUNDRY_USER');
    });

    test('handleStackableActorItemDrop merges into an existing matching stack', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([{ name: `E2E Stack Merge ${stamp}`, type: 'character' }]);
            const [existing] = await actor.createEmbeddedDocuments('Item', [
                { name: `E2E Stimpack ${stamp}`, type: 'drug', system: { quantity: 2 } }
            ]);

            const { handleStackableActorItemDrop } =
                await import('/systems/sla-industries/module/helpers/inventory-stack.mjs');
            const dropData = { name: `E2E Stimpack ${stamp}`, type: 'drug', system: { quantity: 3 } };
            const handled = await handleStackableActorItemDrop(actor, dropData);

            const itemCount = actor.items.filter((i) => i.name === `E2E Stimpack ${stamp}`).length;
            const mergedQuantity = actor.items.get(existing.id).system.quantity;

            await actor.delete();
            return { handled, itemCount, mergedQuantity };
        });

        expect(result.handled).toBe(true);
        expect(result.itemCount).toBe(1);
        expect(result.mergedQuantity).toBe(5);
    });

    test('handleStackableActorItemDrop creates a new item when no matching stack exists', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([{ name: `E2E Stack New ${stamp}`, type: 'character' }]);

            const { handleStackableActorItemDrop } =
                await import('/systems/sla-industries/module/helpers/inventory-stack.mjs');
            const dropData = { name: `E2E New Item ${stamp}`, type: 'item', system: { quantity: 4 } };
            const handled = await handleStackableActorItemDrop(actor, dropData);

            const created = actor.items.find((i) => i.name === `E2E New Item ${stamp}`);
            const createdQuantity = created?.system.quantity;

            await actor.delete();
            return { handled, createdQuantity, found: Boolean(created) };
        });

        expect(result.handled).toBe(true);
        expect(result.found).toBe(true);
        expect(result.createdQuantity).toBe(4);
    });

    test('handleStackableActorItemDrop does not handle non-stackable types', async ({ page }) => {
        const handled = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([{ name: `E2E Stack Skip ${stamp}`, type: 'character' }]);
            const { handleStackableActorItemDrop } =
                await import('/systems/sla-industries/module/helpers/inventory-stack.mjs');
            const result = await handleStackableActorItemDrop(actor, { name: 'E2E Weapon', type: 'weapon' });
            await actor.delete();
            return result;
        });
        expect(handled).toBe(false);
    });

    test('consolidateStackableItemsOnActor merges duplicate stacks and sums quantity', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([{ name: `E2E Consolidate ${stamp}`, type: 'character' }]);
            await actor.createEmbeddedDocuments('Item', [
                { name: `E2E Dupe ${stamp}`, type: 'item', system: { quantity: 2 } },
                { name: `E2E Dupe ${stamp}`, type: 'item', system: { quantity: 3 } }
            ]);

            const { consolidateStackableItemsOnActor } =
                await import('/systems/sla-industries/module/helpers/inventory-stack.mjs');
            const outcome = await consolidateStackableItemsOnActor(actor);

            const remaining = actor.items.filter((i) => i.name === `E2E Dupe ${stamp}`);
            const totalQuantity = remaining.reduce((sum, i) => sum + i.system.quantity, 0);

            await actor.delete();
            return { outcome, remainingCount: remaining.length, totalQuantity };
        });

        expect(result.outcome).toEqual({ merged: 1, skipped: 0 });
        expect(result.remainingCount).toBe(1);
        expect(result.totalQuantity).toBe(5);
    });

    test('consolidateStackableItemsOnActor skips a duplicate group that has embedded Active Effects', async ({
        page
    }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([{ name: `E2E Consolidate Skip ${stamp}`, type: 'character' }]);
            const [withEffect] = await actor.createEmbeddedDocuments('Item', [
                { name: `E2E Dupe Effect ${stamp}`, type: 'item', system: { quantity: 1 } },
                { name: `E2E Dupe Effect ${stamp}`, type: 'item', system: { quantity: 1 } }
            ]);
            await withEffect.createEmbeddedDocuments('ActiveEffect', [{ name: 'E2E Effect', disabled: false }]);

            const { consolidateStackableItemsOnActor } =
                await import('/systems/sla-industries/module/helpers/inventory-stack.mjs');
            const outcome = await consolidateStackableItemsOnActor(actor);

            const remainingCount = actor.items.filter((i) => i.name === `E2E Dupe Effect ${stamp}`).length;
            await actor.delete();
            return { outcome, remainingCount };
        });

        expect(result.outcome).toEqual({ merged: 0, skipped: 1 });
        expect(result.remainingCount).toBe(2);
    });
});

test.describe('GM: item-link drop handlers (document API)', () => {
    test.beforeEach(async ({ page }) => {
        needsAuth();
        await joinGame(page);
        await waitForSLASystem(page);
        const gm = await page.evaluate(() => game.user?.isGM === true);
        test.skip(!gm, 'Requires GM — use a Gamemaster account for FOUNDRY_USER');
    });

    test('handleWeaponDrop links a dropped weapon to a magazine by name', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [weapon] = await Item.createDocuments([{ name: `E2E Rifle ${stamp}`, type: 'weapon' }]);
            const [magazine] = await Item.createDocuments([{ name: `E2E Mag ${stamp}`, type: 'magazine' }]);

            const dt = new DataTransfer();
            dt.setData('text/plain', JSON.stringify({ type: 'Item', uuid: weapon.uuid }));
            const fakeEvent = { preventDefault: () => {}, stopPropagation: () => {}, dataTransfer: dt };

            const { handleWeaponDrop } = await import('/systems/sla-industries/module/helpers/drop-handlers.mjs');
            const handled = await handleWeaponDrop(fakeEvent, magazine);

            const linkedWeapon = game.items.get(magazine.id).system.linkedWeapon;
            await weapon.delete();
            await magazine.delete();
            return { handled, linkedWeapon };
        });

        expect(result.handled).toBe(true);
        expect(result.linkedWeapon).toMatch(/^E2E Rifle /);
    });

    test('handleWeaponDrop rejects a non-weapon item', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [notAWeapon] = await Item.createDocuments([{ name: `E2E Not Weapon ${stamp}`, type: 'skill' }]);
            const [magazine] = await Item.createDocuments([{ name: `E2E Mag Reject ${stamp}`, type: 'magazine' }]);

            const dt = new DataTransfer();
            dt.setData('text/plain', JSON.stringify({ type: 'Item', uuid: notAWeapon.uuid }));
            const fakeEvent = { preventDefault: () => {}, stopPropagation: () => {}, dataTransfer: dt };

            const { handleWeaponDrop } = await import('/systems/sla-industries/module/helpers/drop-handlers.mjs');
            const handled = await handleWeaponDrop(fakeEvent, magazine);

            const linkedWeapon = game.items.get(magazine.id).system.linkedWeapon;
            await notAWeapon.delete();
            await magazine.delete();
            return { handled, linkedWeapon };
        });

        expect(result.handled).toBe(false);
        expect(result.linkedWeapon).toBeFalsy();
    });

    test('handleWeaponSkillDrop links a dropped skill to a weapon by name', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [skill] = await Item.createDocuments([{ name: `E2E Pistol Skill ${stamp}`, type: 'skill' }]);
            const [weapon] = await Item.createDocuments([{ name: `E2E Skillless Rifle ${stamp}`, type: 'weapon' }]);

            const dt = new DataTransfer();
            dt.setData('text/plain', JSON.stringify({ type: 'Item', uuid: skill.uuid }));
            const fakeEvent = { preventDefault: () => {}, stopPropagation: () => {}, dataTransfer: dt };

            const { handleWeaponSkillDrop } = await import('/systems/sla-industries/module/helpers/drop-handlers.mjs');
            const handled = await handleWeaponSkillDrop(fakeEvent, weapon);

            const linkedSkill = game.items.get(weapon.id).system.skill;
            await skill.delete();
            await weapon.delete();
            return { handled, linkedSkill };
        });

        expect(result.handled).toBe(true);
        expect(result.linkedSkill).toMatch(/^E2E Pistol Skill /);
    });

    test('handleDisciplineDrop links a dropped discipline to an Ebb formula by name', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [discipline] = await Item.createDocuments([{ name: `E2E Blast ${stamp}`, type: 'discipline' }]);
            const [formula] = await Item.createDocuments([{ name: `E2E Formula ${stamp}`, type: 'ebbFormula' }]);

            const dt = new DataTransfer();
            dt.setData('text/plain', JSON.stringify({ type: 'Item', uuid: discipline.uuid }));
            const fakeEvent = { preventDefault: () => {}, stopPropagation: () => {}, dataTransfer: dt };

            const { handleDisciplineDrop } = await import('/systems/sla-industries/module/helpers/drop-handlers.mjs');
            const handled = await handleDisciplineDrop(fakeEvent, formula);

            const linkedDiscipline = game.items.get(formula.id).system.discipline;
            await discipline.delete();
            await formula.delete();
            return { handled, linkedDiscipline };
        });

        expect(result.handled).toBe(true);
        expect(result.linkedDiscipline).toMatch(/^E2E Blast /);
    });

    test('handleSkillDrop appends a normalized skill entry and rejects duplicates', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [skill] = await Item.createDocuments([
                { name: `E2E Species Skill ${stamp}`, type: 'skill', system: { rank: '2', stat: 'know' } }
            ]);
            const [species] = await Item.createDocuments([{ name: `E2E Species ${stamp}`, type: 'species' }]);

            const dt = new DataTransfer();
            dt.setData('text/plain', JSON.stringify({ type: 'Item', uuid: skill.uuid }));
            const fakeEvent = () => ({ preventDefault: () => {}, stopPropagation: () => {}, dataTransfer: dt });

            const { handleSkillDrop } = await import('/systems/sla-industries/module/helpers/drop-handlers.mjs');
            const firstHandled = await handleSkillDrop(fakeEvent(), species);
            const afterFirst = game.items.get(species.id).system.skills;
            const secondHandled = await handleSkillDrop(fakeEvent(), species);
            const afterSecond = game.items.get(species.id).system.skills;

            await skill.delete();
            await species.delete();
            return { firstHandled, afterFirst, secondHandled, afterSecondLength: afterSecond.length };
        });

        expect(result.firstHandled).toBe(true);
        expect(result.afterFirst).toHaveLength(1);
        expect(result.afterFirst[0]).toMatchObject({ rank: '2', stat: 'know' });
        expect(result.secondHandled).toBe(false);
        expect(result.afterSecondLength).toBe(1);
    });

    test('handleSkillDelete removes the skill at the given index', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [species] = await Item.createDocuments([
                {
                    name: `E2E Species Delete ${stamp}`,
                    type: 'species',
                    system: {
                        skills: [
                            { name: 'Keep Me', rank: 1, img: 'icons/svg/item-bag.svg', stat: 'dex' },
                            { name: 'Remove Me', rank: 1, img: 'icons/svg/item-bag.svg', stat: 'dex' }
                        ]
                    }
                }
            ]);

            const { handleSkillDelete } = await import('/systems/sla-industries/module/helpers/drop-handlers.mjs');
            await handleSkillDelete(1, species);

            const remaining = game.items.get(species.id).system.skills;
            await species.delete();
            return remaining;
        });

        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('Keep Me');
    });
});
