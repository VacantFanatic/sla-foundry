/**
 * E2E coverage for module/sheets/actor/actor-drops.mjs -- the drop
 * orchestrators around actor-drops-pure.mjs's already-unit-tested helpers.
 * These write directly to real actor/item documents (embedded item
 * create/delete, system.bio.species/package, system.stats.*) and were
 * previously untested.
 */
const { test, expect } = require('@playwright/test');
const { joinGame, waitForSLASystem } = require('./fixtures');

const needsAuth = () => {
    test.skip(!process.env.FOUNDRY_USER, 'Set FOUNDRY_USER (and FOUNDRY_URL / FOUNDRY_PASSWORD if needed)');
};

test.describe('GM: processDroppedSkills (document API)', () => {
    test.beforeEach(async ({ page }) => {
        needsAuth();
        await joinGame(page);
        await waitForSLASystem(page);
        const gm = await page.evaluate(() => game.user?.isGM === true);
        test.skip(!gm, 'Requires GM — use a Gamemaster account for FOUNDRY_USER');
    });

    test('creates a new granted skill item with the source flag set', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([{ name: `E2E Drop Skills New ${stamp}`, type: 'character' }]);

            const { processDroppedSkills } =
                await import('/systems/sla-industries/module/sheets/actor/actor-drops.mjs');
            await processDroppedSkills(
                { actor },
                [{ name: `E2E Granted Skill ${stamp}`, stat: 'know' }],
                'fromSpecies'
            );

            const created = game.actors.get(actor.id).items.find((i) => i.name === `E2E Granted Skill ${stamp}`);
            const persisted = created
                ? {
                      rank: created.system.rank,
                      stat: created.system.stat,
                      flagged: created.getFlag('sla-industries', 'fromSpecies')
                  }
                : null;
            await actor.delete();
            return persisted;
        });

        expect(result).toEqual({ rank: '1', stat: 'know', flagged: true });
    });

    test('upgrades the rank of an existing matching skill instead of duplicating it', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([
                { name: `E2E Drop Skills Upgrade ${stamp}`, type: 'character' }
            ]);
            await actor.createEmbeddedDocuments('Item', [
                { name: `E2E Existing Skill ${stamp}`, type: 'skill', system: { rank: '1' } }
            ]);

            const { processDroppedSkills } =
                await import('/systems/sla-industries/module/sheets/actor/actor-drops.mjs');
            await processDroppedSkills({ actor }, [{ name: `E2E Existing Skill ${stamp}` }], 'fromSpecies');

            const fresh = game.actors.get(actor.id);
            const matches = fresh.items.filter((i) => i.name === `E2E Existing Skill ${stamp}`);
            const outcome = { count: matches.length, rank: matches[0]?.system.rank };
            await actor.delete();
            return outcome;
        });

        expect(result).toEqual({ count: 1, rank: '2' });
    });
});

test.describe('GM: handleSpeciesDrop / handlePackageDrop (document API)', () => {
    test.beforeEach(async ({ page }) => {
        needsAuth();
        await joinGame(page);
        await waitForSLASystem(page);
        const gm = await page.evaluate(() => game.user?.isGM === true);
        test.skip(!gm, 'Requires GM — use a Gamemaster account for FOUNDRY_USER');
    });

    test('handleSpeciesDrop replaces any existing species, sets bio.species, and applies stat minimums', async ({
        page
    }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([{ name: `E2E Species Drop ${stamp}`, type: 'character' }]);
            await actor.createEmbeddedDocuments('Item', [{ name: `E2E Old Species ${stamp}`, type: 'species' }]);

            const speciesData = {
                name: `E2E New Species ${stamp}`,
                type: 'species',
                system: { stats: { str: { min: 6, max: 12 } }, skills: [] }
            };

            const { handleSpeciesDrop } = await import('/systems/sla-industries/module/sheets/actor/actor-drops.mjs');
            await handleSpeciesDrop({ actor }, speciesData);

            const fresh = game.actors.get(actor.id);
            const speciesItems = fresh.items.filter((i) => i.type === 'species');
            const outcome = {
                speciesCount: speciesItems.length,
                speciesName: speciesItems[0]?.name,
                bioSpecies: fresh.system.bio.species,
                strValue: fresh.system.stats.str.value
            };
            await actor.delete();
            return outcome;
        });

        expect(result.speciesCount).toBe(1);
        expect(result.speciesName).toMatch(/^E2E New Species /);
        expect(result.bioSpecies).toMatch(/^E2E New Species /);
        expect(result.strValue).toBe(6);
    });

    test('handlePackageDrop blocks when a stat requirement is not met', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([
                {
                    name: `E2E Package Blocked ${stamp}`,
                    type: 'character',
                    system: { stats: { str: { value: 1, bonus: 0 } } }
                }
            ]);

            const packageData = {
                name: `E2E Demanding Package ${stamp}`,
                type: 'package',
                system: { requirements: { str: 5 }, skills: [] }
            };

            const { handlePackageDrop } = await import('/systems/sla-industries/module/sheets/actor/actor-drops.mjs');
            await handlePackageDrop({ actor }, packageData);

            const packagePresent = game.actors.get(actor.id).items.some((i) => i.type === 'package');
            await actor.delete();
            return packagePresent;
        });

        expect(result).toBe(false);
    });

    test('handlePackageDrop succeeds and sets bio.package when requirements are met', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([
                {
                    name: `E2E Package Ok ${stamp}`,
                    type: 'character',
                    system: { stats: { str: { value: 5, bonus: 0 } } }
                }
            ]);

            const packageData = {
                name: `E2E Doable Package ${stamp}`,
                type: 'package',
                system: { requirements: { str: 5 }, skills: [] }
            };

            const { handlePackageDrop } = await import('/systems/sla-industries/module/sheets/actor/actor-drops.mjs');
            await handlePackageDrop({ actor }, packageData);

            const fresh = game.actors.get(actor.id);
            const outcome = {
                packagePresent: fresh.items.some((i) => i.type === 'package'),
                bioPackage: fresh.system.bio.package
            };
            await actor.delete();
            return outcome;
        });

        expect(result.packagePresent).toBe(true);
        expect(result.bioPackage).toMatch(/^E2E Doable Package /);
    });
});

test.describe('GM: onDropItem dispatch (document API)', () => {
    test.beforeEach(async ({ page }) => {
        needsAuth();
        await joinGame(page);
        await waitForSLASystem(page);
        const gm = await page.evaluate(() => game.user?.isGM === true);
        test.skip(!gm, 'Requires GM — use a Gamemaster account for FOUNDRY_USER');
    });

    test('routes a species item drop to handleSpeciesDrop', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([{ name: `E2E OnDrop Species ${stamp}`, type: 'character' }]);
            const [speciesSource] = await Item.createDocuments([
                { name: `E2E Dropped Species ${stamp}`, type: 'species', system: { skills: [] } }
            ]);

            const { onDropItem } = await import('/systems/sla-industries/module/sheets/actor/actor-drops.mjs');
            await onDropItem({ actor }, {}, { type: 'Item', uuid: speciesSource.uuid });

            const bioSpecies = game.actors.get(actor.id).system.bio.species;
            await actor.delete();
            await speciesSource.delete();
            return bioSpecies;
        });

        expect(result).toMatch(/^E2E Dropped Species /);
    });

    test('auto-equips a weapon dropped onto an NPC (Threat) actor', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([{ name: `E2E OnDrop NPC ${stamp}`, type: 'npc' }]);
            const [weaponSource] = await Item.createDocuments([
                { name: `E2E Dropped Weapon ${stamp}`, type: 'weapon', system: { equipped: false } }
            ]);

            const { onDropItem } = await import('/systems/sla-industries/module/sheets/actor/actor-drops.mjs');
            await onDropItem({ actor }, {}, { type: 'Item', uuid: weaponSource.uuid });

            const created = game.actors.get(actor.id).items.find((i) => i.name === `E2E Dropped Weapon ${stamp}`);
            const equipped = created?.system.equipped;
            await actor.delete();
            await weaponSource.delete();
            return equipped;
        });

        expect(result).toBe(true);
    });

    test('falls through to stacking a non-species/package/auto-equip item', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([{ name: `E2E OnDrop Stack ${stamp}`, type: 'character' }]);
            const [drugSource] = await Item.createDocuments([
                { name: `E2E Dropped Drug ${stamp}`, type: 'drug', system: { quantity: 1 } }
            ]);

            const { onDropItem } = await import('/systems/sla-industries/module/sheets/actor/actor-drops.mjs');
            const handled = await onDropItem({ actor }, {}, { type: 'Item', uuid: drugSource.uuid });

            const created = game.actors.get(actor.id).items.find((i) => i.name === `E2E Dropped Drug ${stamp}`);
            await actor.delete();
            await drugSource.delete();
            return { handled, quantity: created?.system.quantity };
        });

        expect(result.handled).toBe(true);
        expect(result.quantity).toBe(1);
    });
});
