/**
 * Vitals context (HP bar, wound count, condition toggles) shared by the actor sheets and the GM Combat HUD,
 * so both render `wounds.hbs` from identical data.
 */
import { countWounds, hpBarState } from './sheet-ux-pure.mjs';

/** Togglable conditions mirrored from Active Effects. Critical is derived from HP, never toggled. */
const TOGGLE_CONDITION_IDS = ['bleeding', 'burning', 'stunned', 'prone', 'immobile'];

/**
 * @param {Actor} actor
 * @returns {{ woundCount: number, woundCountLabel?: string, hpBar: { percent: number, tone: string, isCriticalHp: boolean } }}
 */
export function buildVitalsContext(actor) {
    const system = actor.system;
    system.wounds = system.wounds || {};
    system.conditions = system.conditions || {};

    const woundCount = countWounds(system.wounds);
    const hpState = hpBarState(system.hp?.value, system.hp?.max);
    const out = {
        woundCount,
        hpBar: {
            percent: hpState.percent,
            tone: hpState.tone,
            isCriticalHp: hpState.tone === 'critical' || Boolean(system.conditions.critical)
        }
    };
    if (woundCount > 0) {
        out.woundCountLabel = game.i18n.format('SLA.ActorSheet.WoundCount', { count: woundCount });
    }

    // Sync togglable conditions from Active Effects so buttons match the token.
    for (const statusId of TOGGLE_CONDITION_IDS) {
        system.conditions[statusId] = actor.effects.some((e) => e.statuses.has(statusId));
    }

    return out;
}
