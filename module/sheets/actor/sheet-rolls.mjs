import { executeSkillRollFromItem } from './skill-rolls.mjs';
import { executeStatRoll } from './stat-rolls.mjs';
import { triggerItemRoll } from './item-actions.mjs';

/**
 * @param {import('../actor-sheet.mjs').SlaActorSheet} sheet
 * @param {PointerEvent} event
 * @param {HTMLElement} [rollTarget]
 */
export async function handleSheetRoll(sheet, event, rollTarget) {
    event.preventDefault();
    const element = rollTarget ?? event.currentTarget;
    const dataset = element.dataset;

    if (dataset.rollType === 'item') {
        const itemId = element.closest('.item')?.dataset.itemId;
        const item = itemId ? sheet.actor.items.get(itemId) : null;
        if (item) await triggerItemRoll(sheet, item);
        return;
    }

    if (dataset.rollType === 'stat') {
        await executeStatRoll(sheet, dataset.key);
        return;
    }

    if (dataset.rollType === 'skill') {
        const itemId = element.closest('.item')?.dataset.itemId;
        const item = itemId ? sheet.actor.items.get(itemId) : null;
        if (item) await executeSkillRollFromItem(sheet, item);
        return;
    }

    if (dataset.rollType === 'init') {
        await sheet.actor.rollInitiative({ createCombatants: true });
    }
}
