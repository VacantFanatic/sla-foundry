import { SlaSimpleContentDialog } from '../../apps/sla-simple-dialog.mjs';

/**
 * @param {import('../actor-sheet.mjs').SlaActorSheet} sheet
 */
export async function onReloadWeapon(sheet, event, reloadEl) {
    event.preventDefault();
    const li = (reloadEl ?? event.currentTarget).closest('.item');
    const weapon = li?.dataset.itemId ? sheet.actor.items.get(li.dataset.itemId) : null;
    if (!weapon) return;
    const weaponName = weapon.name;

    const candidates = sheet.actor.items.filter(
        (i) => i.type === 'magazine' && i.system.linkedWeapon === weaponName && i.system.quantity > 0
    );

    if (candidates.length === 0) {
        return ui.notifications.warn(`No magazines found linked to: '${weaponName}'`);
    }

    if (candidates.length === 1) {
        return performReload(sheet, weapon, candidates[0]);
    }

    const content = await foundry.applications.handlebars.renderTemplate(
        'systems/sla-industries/templates/dialogs/reload-dialog.hbs',
        {
            weaponName: weaponName,
            candidates: candidates
        }
    );

    await new SlaSimpleContentDialog({
        title: 'Select Ammunition',
        contentHtml: content,
        width: 420,
        classes: ['sla-dialog', 'sla-sheet'],
        actionLabel: 'Load Magazine',
        onConfirm: (root) => {
            const magId = root.querySelector('#magazine-select')?.value;
            const mag = magId ? sheet.actor.items.get(magId) : null;
            if (mag) void performReload(sheet, weapon, mag);
        }
    }).render(true);
}

/**
 * @param {import('../actor-sheet.mjs').SlaActorSheet} sheet
 */
export async function performReload(sheet, weapon, magazine) {
    const capacity = magazine.system.ammoCapacity || 10;

    await weapon.update({
        'system.ammo': capacity,
        'system.maxAmmo': capacity
    });

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
}
