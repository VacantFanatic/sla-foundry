import { executeStandardDamageRoll, resolveDamageDisplay } from './chat/damage.mjs';
import { setButtonDisabled } from './chat/dom.mjs';
import {
    onApplyDamage,
    onApplyEbbEffects,
    onChangeDifficulty,
    onLuck,
    onRemoveEbbWounds,
    onRollDamage,
    onToggleRoll
} from './chat/handlers.mjs';

const CHAT_CLICK_SELECTOR =
    '.chat-btn-wound, .chat-btn-damage, .damage-roll, .apply-damage-btn, .roll-toggle, .chat-btn-luck, .diff-btn, .sla-ebb-apply-effect-btn, .sla-ebb-remove-wounds-btn';

/** @type {((ev: Event) => void)|null} */
let _chatClickHandler = null;

export class SLAChat {
    /**
     * @param {ChatMessage} message
     * @param {HTMLElement|JQuery} html
     */
    static applyEbbHealWoundOrLockFromMessage(message, html) {
        const sla = message.flags?.sla;
        if (!sla?.ebbHealWoundMutualExclude) return;
        const used = sla.ebbHealWoundPathUsed;
        if (!used) return;
        const root = html instanceof HTMLElement ? html : html[0];
        const card = root?.querySelector?.('.sla-chat-card');
        if (!card) return;
        SLAChat._applyEbbHealWoundOrLockToCard(card, used);
    }

    /**
     * @param {HTMLElement} card
     * @param {"heal"|"wounds"} pathUsed
     */
    static _applyEbbHealWoundOrLockToCard(card, pathUsed) {
        const healLocksWounds = game.i18n.localize('SLA.EbbHealWoundLockedOtherUsedHeal');
        const woundsLocksHeal = game.i18n.localize('SLA.EbbHealWoundLockedOtherUsedWounds');
        const healAlreadyUsed = game.i18n.localize('SLA.EbbHealWoundHealAlreadyUsed');
        const woundsAlreadyUsed = game.i18n.localize('SLA.EbbHealWoundWoundsAlreadyUsed');
        const healBtns = card.querySelectorAll('.damage-roll');
        const woundBtns = card.querySelectorAll('.sla-ebb-remove-wounds-btn');
        if (pathUsed === 'heal') {
            for (const el of healBtns) setButtonDisabled(el, true, healAlreadyUsed);
            for (const el of woundBtns) setButtonDisabled(el, true, healLocksWounds);
        } else if (pathUsed === 'wounds') {
            for (const el of healBtns) setButtonDisabled(el, true, woundsLocksHeal);
            for (const el of woundBtns) setButtonDisabled(el, true, woundsAlreadyUsed);
        }
    }

    static _ebbHealWoundRenderHook(message, html) {
        SLAChat.applyEbbHealWoundOrLockFromMessage(message, html);
    }

    static _resolveDamageDisplay(formula, actor = null) {
        return resolveDamageDisplay(formula, actor);
    }

    static init() {
        if (_chatClickHandler) {
            document.body.removeEventListener('click', _chatClickHandler);
        }

        _chatClickHandler = (ev) => {
            const target = ev.target instanceof Element ? ev.target : null;
            if (!target) return;
            const el = target.closest(CHAT_CLICK_SELECTOR);
            if (!el) return;

            if (el.matches('.chat-btn-wound, .chat-btn-damage, .damage-roll')) {
                void onRollDamage({ ...ev, currentTarget: el });
            } else if (el.matches('.apply-damage-btn')) {
                void onApplyDamage({ ...ev, currentTarget: el });
            } else if (el.matches('.sla-ebb-apply-effect-btn')) {
                void onApplyEbbEffects({ ...ev, currentTarget: el });
            } else if (el.matches('.sla-ebb-remove-wounds-btn')) {
                void onRemoveEbbWounds({ ...ev, currentTarget: el });
            } else if (el.matches('.roll-toggle')) {
                onToggleRoll({ ...ev, currentTarget: el });
            } else if (el.matches('.chat-btn-luck')) {
                void onLuck({ ...ev, currentTarget: el });
            } else if (el.matches('.diff-btn')) {
                void onChangeDifficulty({ ...ev, currentTarget: el });
            }
        };

        document.body.addEventListener('click', _chatClickHandler);

        Hooks.off('renderChatMessage', SLAChat._ebbHealWoundRenderHook);
        Hooks.on('renderChatMessage', SLAChat._ebbHealWoundRenderHook);
    }

    static async executeStandardDamageRoll(options) {
        return executeStandardDamageRoll(options);
    }

    static async onRenderChatMessage(message, html, data) {
        const htmlElement = html instanceof HTMLElement ? html : html[0];
        if (!htmlElement) return;

        const ebbBlock = htmlElement.querySelector('.sla-ebb-effect-actions');
        if (ebbBlock) {
            if (!game.user.isGM) {
                ebbBlock.remove();
            } else {
                const targets = message.flags?.sla?.targets || [];
                if (targets.length > 0) {
                    try {
                        const targetUuid = targets[0];
                        const tokenDocument = await fromUuid(targetUuid);
                        if (tokenDocument) {
                            const ebbTargetBtn = htmlElement.querySelector(
                                '.sla-ebb-apply-effect-btn[data-target="target"]'
                            );
                            if (ebbTargetBtn) {
                                ebbTargetBtn.innerHTML = `<i class="fas fa-crosshairs"></i> Apply effects to ${tokenDocument.name}`;
                                ebbTargetBtn.setAttribute('data-target-uuid', targetUuid);
                            }
                        }
                    } catch (err) {
                        console.error('SLA | Error in onRenderChatMessage (Ebb effect target button):', err);
                    }
                }
            }
        }

        const dmgButtons = htmlElement.querySelectorAll('.apply-damage-btn');
        if (!dmgButtons.length) return;

        if (!game.user.isGM) {
            for (const btn of dmgButtons) btn.remove();
            return;
        }

        const targets = message.flags?.sla?.targets || [];
        if (targets.length > 0) {
            try {
                const targetUuid = targets[0];
                const tokenDocument = await fromUuid(targetUuid);

                if (tokenDocument) {
                    const targetBtn = htmlElement.querySelector('.apply-damage-btn[data-target="target"]');
                    if (targetBtn) {
                        targetBtn.innerHTML = `<i class="fas fa-crosshairs"></i> Apply to ${tokenDocument.name}`;
                        targetBtn.setAttribute('data-target-uuid', targetUuid);
                    }
                }
            } catch (err) {
                console.error('SLA | Error in onRenderChatMessage (target button):', err);
            }
        }
    }
}
