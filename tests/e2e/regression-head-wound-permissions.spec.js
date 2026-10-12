/**
 * Issue #418: wound side effects must work for a player who does NOT own the target.
 *
 * Needs two independent logged-in clients: the GM (FOUNDRY_USER) and a passwordless PLAYER user
 * created here. A GM-only test cannot see this bug class, because `_onUpdate` side effects only
 * fail on clients that lack permission to write to the actor.
 */
const { test, expect } = require('@playwright/test');
const { joinGame, joinAs, waitForSLASystem } = require('./fixtures');

const PLAYER_NAME = 'E2E Wound Player';
const WOUND_FIELDS = ['head', 'torso', 'lArm', 'rArm', 'lLeg', 'rLeg'];
const NO_WOUNDS = { head: false, torso: false, lArm: false, rArm: false, lLeg: false, rLeg: false };

test.describe.configure({ mode: 'serial' });

test.describe('Player vs unowned NPC: wound side effects (two clients)', () => {
    /** @type {import('@playwright/test').Page} */
    let gm;
    /** @type {{ context: import('@playwright/test').BrowserContext, page: import('@playwright/test').Page, errors: string[] } | null} */
    let player;
    let setup;
    let gmContext;

    const statuses = (page, actorId) =>
        page.evaluate((id) => [...game.actors.get(id).effects].flatMap((e) => [...e.statuses]).sort(), actorId);

    const resetWounds = async () => {
        await gm.evaluate(async (id) => {
            await game.actors.get(id).update({
                'system.wounds': { head: false, torso: false, lArm: false, rArm: false, lLeg: false, rLeg: false }
            });
        }, setup.npcId);
        await gm.waitForFunction((id) => game.actors.get(id).effects.size === 0, setup.npcId, { timeout: 15_000 });
        await player.page.waitForFunction((id) => game.actors.get(id).effects.size === 0, setup.npcId, {
            timeout: 15_000
        });
    };

    test.beforeAll(async ({ browser, baseURL }) => {
        test.skip(!process.env.FOUNDRY_USER, 'Set FOUNDRY_USER (and FOUNDRY_URL / FOUNDRY_PASSWORD if needed)');
        gmContext = await browser.newContext({ baseURL, viewport: { width: 1366, height: 768 } });
        gm = await gmContext.newPage();
        await joinGame(gm);
        await waitForSLASystem(gm);
        const isGm = await gm.evaluate(() => game.user?.isGM === true);
        test.skip(!isGm, 'Requires GM — use a Gamemaster account for FOUNDRY_USER');

        setup = await gm.evaluate(async (playerName) => {
            for (const u of game.users.filter((x) => x.name === playerName)) await u.delete();
            const user = await User.create({ name: playerName, role: CONST.USER_ROLES.PLAYER });
            const npc = await Actor.create({ name: 'E2E Actor Wound NPC', type: 'npc', ownership: { default: 2 } });
            const scene = await Scene.create({
                name: 'E2E Wound Scene',
                width: 2000,
                height: 2000,
                grid: { size: 100 }
            });
            const [token] = await scene.createEmbeddedDocuments('Token', [
                (await npc.getTokenDocument({ x: 500, y: 500 })).toObject()
            ]);
            await scene.activate();
            return { userId: user.id, npcId: npc.id, sceneId: scene.id, tokenId: token.id };
        }, PLAYER_NAME);

        player = await joinAs(browser, PLAYER_NAME, baseURL);
        await player.page.waitForFunction((id) => canvas?.ready && canvas.scene?.id === id, setup.sceneId, {
            timeout: 60_000
        });
    });

    test.afterAll(async () => {
        await player?.context.close().catch(() => {});
        if (gm && setup) {
            await gm
                .evaluate(async (s) => {
                    await game.scenes.get(s.sceneId)?.delete();
                    await game.actors.get(s.npcId)?.delete();
                    await game.users.get(s.userId)?.delete();
                })
                .catch(() => {});
        }
        await gmContext?.close().catch(() => {});
    });

    test('the player really cannot modify the NPC (guards against a vacuous pass)', async () => {
        const canModify = await player.page.evaluate(
            (id) => game.actors.get(id).canUserModify(game.user, 'update'),
            setup.npcId
        );
        expect(canModify).toBe(false);
        const message = await player.page.evaluate(async (id) => {
            try {
                await game.actors.get(id).update({ 'system.wounds.torso': true });
                return 'allowed';
            } catch (err) {
                return err.message;
            }
        }, setup.npcId);
        expect(message).toMatch(/lacks permission to update Actor/);
        player.errors.length = 0;
    });

    for (const field of WOUND_FIELDS) {
        test(`a GM-applied ${field} wound leaves the player's client error-free and synced`, async () => {
            await resetWounds();
            player.errors.length = 0;

            await gm.evaluate(
                async ({ id, f }) => {
                    await game.actors.get(id).update({ [`system.wounds.${f}`]: true });
                },
                { id: setup.npcId, f: field }
            );
            const expected = field === 'head' ? ['bleeding', 'stunned'] : ['bleeding'];
            await gm.waitForFunction(
                ({ id, n }) => game.actors.get(id).effects.size >= n,
                { id: setup.npcId, n: expected.length },
                { timeout: 15_000 }
            );
            await player.page.waitForFunction(
                ({ id, n }) => game.actors.get(id).effects.size >= n,
                { id: setup.npcId, n: expected.length },
                { timeout: 15_000 }
            );
            // Let any (erroneous) client-side follow-up writes surface before asserting silence.
            await player.page.waitForTimeout(1500);

            expect(await statuses(gm, setup.npcId)).toEqual(expected);
            expect(await statuses(player.page, setup.npcId)).toEqual(expected);
            expect(player.errors).toEqual([]);
        });
    }

    test('a player attack that earns the head wound is relayed to the GM and applied', async () => {
        await resetWounds();
        player.errors.length = 0;

        const result = await player.page.evaluate(
            async ({ tokenId, npcId }) => {
                canvas.tokens.get(tokenId).setTarget(true, { releaseOthers: true });
                const { applyHeadshotSideEffect } =
                    await import('/systems/sla-industries/module/sheets/actor/sheet-helpers.mjs');
                const notes = [];
                await applyHeadshotSideEffect(notes);
                return { notes };
            },
            { tokenId: setup.tokenId, npcId: setup.npcId }
        );
        expect(result.notes.join('')).toContain('Head Wound Applied!');

        await gm.waitForFunction((id) => game.actors.get(id).system.wounds.head === true, setup.npcId, {
            timeout: 15_000
        });
        await player.page.waitForFunction((id) => game.actors.get(id).effects.size >= 2, setup.npcId, {
            timeout: 15_000
        });
        await player.page.waitForTimeout(1500);

        expect(await statuses(gm, setup.npcId)).toEqual(['bleeding', 'stunned']);
        expect(player.errors).toEqual([]);
    });

    test('with no GM online the player gets a note and nothing is written or thrown', async () => {
        await resetWounds();
        await gm.close();
        await player.page.waitForFunction(() => !game.users.activeGM, null, { timeout: 30_000 });
        player.errors.length = 0;

        const result = await player.page.evaluate(
            async ({ tokenId, npcId }) => {
                canvas.tokens.get(tokenId).setTarget(true, { releaseOthers: true });
                const { applyHeadshotSideEffect } =
                    await import('/systems/sla-industries/module/sheets/actor/sheet-helpers.mjs');
                const notes = [];
                await applyHeadshotSideEffect(notes);
                await new Promise((r) => setTimeout(r, 1500));
                return { notes, head: game.actors.get(npcId).system.wounds.head };
            },
            { tokenId: setup.tokenId, npcId: setup.npcId }
        );

        expect(result.head).toBe(false);
        expect(result.notes.join('')).toMatch(/no GM is online/);
        expect(player.errors).toEqual([]);

        // Bring a GM back for teardown and the remaining state.
        gm = await gmContext.newPage();
        await joinGame(gm);
        await waitForSLASystem(gm);
    });
});
