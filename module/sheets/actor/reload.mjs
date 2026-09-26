import { SlaSimpleContentDialog } from '../../apps/sla-simple-dialog.mjs';
import { buildReloadWeaponUpdate } from './reload-pure.mjs';

/**
 * Embedded `magazine` items on `actor` that can reload `weapon` — linked by name
 * (SlaMagazineData.linkedWeapon stores the weapon's `.name`, not a UUID) with stock remaining.
 * @param {Actor} actor
 * @param {Item} weapon
 * @returns {Item[]}
 */
export function findLinkedMagazineCandidates(actor, weapon) {
    return actor.items.filter(
        (i) => i.type === 'magazine' && i.system.linkedWeapon === weapon.name && i.system.quantity > 0
    );
}

/**
 * Render the ammo-selection dialog for `weapon`'s multiple magazine candidates and perform the
 * reload with whichever one the user confirms. Resolves once the dialog closes, one way or
 * another — this is the same dialog whether it was opened from a rendered sheet or headlessly via
 * `game.sla.reloadWeapon`, since a Foundry Application renders as its own floating window and
 * doesn't require a sheet to be open.
 * @param {import('../actor-sheet.mjs').SlaActorSheet} sheet
 * @param {Item} weapon
 * @param {Item[]} candidates
 * @returns {Promise<boolean>} Whether a magazine was picked and consumed (false if cancelled/closed).
 */
export async function promptMagazineSelection(sheet, weapon, candidates) {
    const content = await foundry.applications.handlebars.renderTemplate(
        'systems/sla-industries/templates/dialogs/reload-dialog.hbs',
        {
            weaponName: weapon.name,
            candidates: candidates
        }
    );

    return new Promise((resolve) => {
        new SlaSimpleContentDialog({
            title: 'Select Ammunition',
            contentHtml: content,
            width: 420,
            classes: ['sla-dialog', 'sla-sheet'],
            actionLabel: 'Load Magazine',
            onConfirm: async (root) => {
                const magId = root.querySelector('#magazine-select')?.value;
                const mag = magId ? sheet.actor.items.get(magId) : null;
                resolve(mag ? await performReload(sheet, weapon, mag) : false);
            },
            onClose: () => resolve(false)
        }).render(true);
    });
}

/**
 * @param {import('../actor-sheet.mjs').SlaActorSheet} sheet
 * @returns {Promise<boolean|undefined>}
 */
export async function onReloadWeapon(sheet, event, reloadEl) {
    event.preventDefault();
    const li = (reloadEl ?? event.currentTarget).closest('.item');
    const weapon = li?.dataset.itemId ? sheet.actor.items.get(li.dataset.itemId) : null;
    if (!weapon) return;
    const weaponName = weapon.name;

    const candidates = findLinkedMagazineCandidates(sheet.actor, weapon);

    if (candidates.length === 0) {
        ui.notifications.warn(`No magazines found linked to: '${weaponName}'`);
        return false;
    }

    if (candidates.length === 1) {
        return performReload(sheet, weapon, candidates[0]);
    }

    return promptMagazineSelection(sheet, weapon, candidates);
}

/**
 * @param {import('../actor-sheet.mjs').SlaActorSheet} sheet
 */
export async function performReload(sheet, weapon, magazine) {
    const capacity = magazine.system.ammoCapacity || 10;

    await weapon.update(buildReloadWeaponUpdate(magazine.system));

    const newQty = (magazine.system.quantity || 1) - 1;
    const magazineDepleted = newQty <= 0;

    if (magazineDepleted) {
        await magazine.delete();
    } else {
        await magazine.update({ 'system.quantity': newQty });
    }

    const templateData = {
        weaponName: weapon.name.toUpperCase(),
        actorName: sheet.actor.name,
        magazineName: magazine.name,
        ammoLoaded: capacity,
        magazineDepleted: magazineDepleted,
        magazinesRemaining: newQty
    };

    const content = await foundry.applications.handlebars.renderTemplate(
        'systems/sla-industries/templates/chat/reload.hbs',
        templateData
    );

    ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: sheet.actor }),
        content: content
    });

    return true;
}
