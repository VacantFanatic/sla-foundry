/**
 * E2E coverage for module/helpers/chat.mjs's rendered-card DOM mutation
 * functions -- both read message.flags.sla back out to lock/relabel buttons
 * on re-render, a "flags round-trip" pattern, and were previously untested.
 */
const { test, expect } = require('@playwright/test');
const { joinGame, waitForSLASystem } = require('./fixtures');

const needsAuth = () => {
    test.skip(!process.env.FOUNDRY_USER, 'Set FOUNDRY_USER (and FOUNDRY_URL / FOUNDRY_PASSWORD if needed)');
};

test.describe('GM: SLAChat card render helpers (document API)', () => {
    test.beforeEach(async ({ page }) => {
        needsAuth();
        await joinGame(page);
        await waitForSLASystem(page);
        const gm = await page.evaluate(() => game.user?.isGM === true);
        test.skip(!gm, 'Requires GM — use a Gamemaster account for FOUNDRY_USER');
    });

    test('applyEbbHealWoundOrLockFromMessage disables the heal button once the wound path was used', async ({
        page
    }) => {
        const result = await page.evaluate(async () => {
            const html = document.createElement('div');
            html.innerHTML =
                '<div class="sla-chat-card">' +
                '<button class="damage-roll"></button>' +
                '<button class="sla-ebb-remove-wounds-btn"></button>' +
                '</div>';
            const message = { flags: { sla: { ebbHealWoundMutualExclude: true, ebbHealWoundPathUsed: 'wounds' } } };

            const { SLAChat } = await import('/systems/sla-industries/module/helpers/chat.mjs');
            SLAChat.applyEbbHealWoundOrLockFromMessage(message, html);

            const healBtn = html.querySelector('.damage-roll');
            const woundBtn = html.querySelector('.sla-ebb-remove-wounds-btn');
            return {
                healDisabled: healBtn.disabled,
                healHasTitle: Boolean(healBtn.getAttribute('title')),
                woundDisabled: woundBtn.disabled,
                woundHasTitle: Boolean(woundBtn.getAttribute('title'))
            };
        });

        // "wounds" path used -> heal button locked (can't also heal), wound button shows "already used".
        expect(result.healDisabled).toBe(true);
        expect(result.healHasTitle).toBe(true);
        expect(result.woundDisabled).toBe(true);
        expect(result.woundHasTitle).toBe(true);
    });

    test('applyEbbHealWoundOrLockFromMessage is a no-op when no path has been used yet', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const html = document.createElement('div');
            html.innerHTML =
                '<div class="sla-chat-card">' +
                '<button class="damage-roll"></button>' +
                '<button class="sla-ebb-remove-wounds-btn"></button>' +
                '</div>';
            const message = { flags: { sla: { ebbHealWoundMutualExclude: true } } };

            const { SLAChat } = await import('/systems/sla-industries/module/helpers/chat.mjs');
            SLAChat.applyEbbHealWoundOrLockFromMessage(message, html);

            return {
                healDisabled: html.querySelector('.damage-roll').disabled,
                woundDisabled: html.querySelector('.sla-ebb-remove-wounds-btn').disabled
            };
        });

        expect(result.healDisabled).toBe(false);
        expect(result.woundDisabled).toBe(false);
    });

    test('onRenderChatMessage relabels the apply-damage and Ebb-effect buttons with the resolved target name', async ({
        page
    }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            // fromUuid() resolves any document type; an Actor stands in for the target document
            // here since onRenderChatMessage only reads .name off whatever it resolves.
            const [target] = await Actor.createDocuments([{ name: `E2E Render Target ${stamp}`, type: 'character' }]);

            const html = document.createElement('div');
            html.innerHTML =
                '<div class="apply-damage-btn" data-target="target"></div>' +
                '<div class="sla-ebb-effect-actions">' +
                '<button class="sla-ebb-apply-effect-btn" data-target="target"></button>' +
                '</div>';
            const message = { flags: { sla: { targets: [target.uuid] } } };

            const { SLAChat } = await import('/systems/sla-industries/module/helpers/chat.mjs');
            await SLAChat.onRenderChatMessage(message, html, {});

            const dmgBtn = html.querySelector('.apply-damage-btn');
            const ebbBtn = html.querySelector('.sla-ebb-apply-effect-btn');
            const persisted = {
                dmgLabel: dmgBtn.innerHTML,
                dmgTargetUuid: dmgBtn.getAttribute('data-target-uuid'),
                ebbLabel: ebbBtn.innerHTML,
                ebbTargetUuid: ebbBtn.getAttribute('data-target-uuid')
            };
            await target.delete();
            return persisted;
        });

        expect(result.dmgLabel).toContain('E2E Render Target');
        expect(result.dmgTargetUuid).toBeTruthy();
        expect(result.ebbLabel).toContain('E2E Render Target');
        expect(result.ebbTargetUuid).toBeTruthy();
    });
});
