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

test.describe.configure({ timeout: 60_000 });

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

    test('chat-damage-result.hbs renders a clickable, enabled Undo button', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const content = await foundry.applications.handlebars.renderTemplate(
                'systems/sla-industries/templates/chat/chat-damage-result.hbs',
                {
                    victimName: 'Target',
                    rawDamage: 8,
                    effectivePV: 2,
                    finalDamage: 6,
                    hpData: { old: 10, new: 4 },
                    armorData: null,
                    undo: { victimUuid: 'Actor.xyz', undone: false }
                }
            );
            const fragment = document.createElement('div');
            fragment.innerHTML = content;
            const btn = fragment.querySelector('.undo-damage-btn');
            return {
                found: Boolean(btn),
                disabled: btn?.disabled,
                victimUuid: btn?.getAttribute('data-victim-uuid')
            };
        });

        expect(result.found).toBe(true);
        expect(result.disabled).toBe(false);
        expect(result.victimUuid).toBe('Actor.xyz');
    });

    test('chat-damage-result.hbs renders a disabled Undo button once undo.undone is true', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const content = await foundry.applications.handlebars.renderTemplate(
                'systems/sla-industries/templates/chat/chat-damage-result.hbs',
                {
                    victimName: 'Target',
                    rawDamage: 8,
                    effectivePV: 2,
                    finalDamage: 6,
                    hpData: { old: 10, new: 4 },
                    armorData: null,
                    undo: { victimUuid: 'Actor.xyz', undone: true }
                }
            );
            const fragment = document.createElement('div');
            fragment.innerHTML = content;
            const btn = fragment.querySelector('.undo-damage-btn');
            return { disabled: btn?.disabled, hasTitle: Boolean(btn?.getAttribute('title')) };
        });

        expect(result.disabled).toBe(true);
        expect(result.hasTitle).toBe(true);
    });

    test('applyUndoLockFromMessage disables the Undo button once the message flags say undone', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const html = document.createElement('div');
            html.innerHTML =
                '<div class="sla-chat-card damage-result">' + '<button class="undo-damage-btn"></button>' + '</div>';
            const message = { flags: { sla: { undo: { undone: true } } } };

            const { SLAChat } = await import('/systems/sla-industries/module/helpers/chat.mjs');
            SLAChat.applyUndoLockFromMessage(message, html);

            const btn = html.querySelector('.undo-damage-btn');
            return { disabled: btn.disabled, hasTitle: Boolean(btn.getAttribute('title')) };
        });

        expect(result.disabled).toBe(true);
        expect(result.hasTitle).toBe(true);
    });

    test('applyUndoLockFromMessage is a no-op when the message has not been undone', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const html = document.createElement('div');
            html.innerHTML =
                '<div class="sla-chat-card damage-result">' + '<button class="undo-damage-btn"></button>' + '</div>';
            const message = { flags: { sla: { undo: { undone: false } } } };

            const { SLAChat } = await import('/systems/sla-industries/module/helpers/chat.mjs');
            SLAChat.applyUndoLockFromMessage(message, html);

            return { disabled: html.querySelector('.undo-damage-btn').disabled };
        });

        expect(result.disabled).toBe(false);
    });

    test('onRenderChatMessage strips the Undo button for non-GM viewers', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const html = document.createElement('div');
            html.innerHTML = '<div class="sla-chat-card damage-result"><button class="undo-damage-btn"></button></div>';
            const message = { flags: { sla: {} } };

            // isGM is typically inherited (not an own property), so there is nothing to restore
            // via defineProperty afterward -- deleting the instance override reveals it again.
            const hadOwnDescriptor = Object.prototype.hasOwnProperty.call(game.user, 'isGM');
            const originalDescriptor = hadOwnDescriptor ? Object.getOwnPropertyDescriptor(game.user, 'isGM') : null;
            Object.defineProperty(game.user, 'isGM', { configurable: true, get: () => false });
            try {
                const { SLAChat } = await import('/systems/sla-industries/module/helpers/chat.mjs');
                await SLAChat.onRenderChatMessage(message, html, {});
            } finally {
                if (hadOwnDescriptor) {
                    Object.defineProperty(game.user, 'isGM', originalDescriptor);
                } else {
                    delete game.user.isGM;
                }
            }

            return { found: Boolean(html.querySelector('.undo-damage-btn')) };
        });

        expect(result.found).toBe(false);
    });
});
