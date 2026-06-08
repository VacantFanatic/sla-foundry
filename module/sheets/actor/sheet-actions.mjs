import { XPDialog } from '../../apps/xp-dialog.mjs';
import { SlaSimpleContentDialog } from '../../apps/sla-simple-dialog.mjs';
import { onItemCreate } from './actor-drops.mjs';
import { onReloadWeapon } from './reload.mjs';
import { useDrugItem } from './item-actions.mjs';
import { executeCombatLoadoutDamageRoll } from './weapon-gates.mjs';
import { buildSpeciesRemovalUpdates } from './sheet-actions-pure.mjs';
import { handleSheetRoll } from './sheet-rolls.mjs';

/** @param {import('../actor-sheet.mjs').SlaActorSheet} sheet */
export async function openActorImagePicker(sheet) {
    const Picker = foundry.applications.apps?.FilePicker ?? globalThis.FilePicker;
    if (!Picker) {
        ui.notifications?.error?.('FilePicker is unavailable.');
        return;
    }
    const fp = new Picker({
        type: 'image',
        current: sheet.actor.img,
        callback: (path) => {
            if (path) void sheet.actor.update({ img: path });
        }
    });
    await fp.render(true);
}

/** @param {import('../actor-sheet.mjs').SlaActorSheet} sheet */
export async function confirmSheetAction(sheet, title, contentHtml, onConfirm, actionLabel = 'Confirm') {
    await new SlaSimpleContentDialog({
        title,
        contentHtml,
        width: 420,
        classes: ['sla-dialog', 'sla-sheet'],
        actionLabel,
        onConfirm: async () => {
            await onConfirm();
        }
    }).render(true);
}

/** @param {import('../actor-sheet.mjs').SlaActorSheet} sheet */
export async function handleSheetClick(sheet, event) {
    const t = event.target;
    if (!(t instanceof Element)) return;

    const cond = t.closest('.condition-toggle');
    if (cond) {
        event.preventDefault();
        if (cond.classList.contains('condition-automatic')) return;
        const conditionId = cond.dataset.condition;
        if (conditionId) await sheet.actor.toggleStatusEffect(conditionId);
        return;
    }

    const damageRoll = t.closest('.item-roll-damage');
    if (damageRoll) {
        event.preventDefault();
        await executeCombatLoadoutDamageRoll(sheet, damageRoll);
        return;
    }

    const rollable = t.closest('.item-rollable') || t.closest('.rollable');
    if (rollable) {
        event.preventDefault();
        await handleSheetRoll(sheet, event, rollable);
        return;
    }

    const comp = t.closest('.open-compendium');
    if (comp) {
        event.preventDefault();
        const compendiumId = comp.dataset.compendium;
        const pack = game.packs.get(compendiumId);
        if (pack) pack.render(true);
        else ui.notifications.warn(`Compendium '${compendiumId}' not found.`);
        return;
    }

    const dataEdit = t.closest('[data-edit]');
    if (dataEdit instanceof HTMLElement && sheet.isEditable && dataEdit.dataset.edit === 'img') {
        event.preventDefault();
        event.stopPropagation();
        await openActorImagePicker(sheet);
        return;
    }

    const itemToggle = t.closest('.item-toggle');
    if (itemToggle && sheet.actor.isOwner) {
        event.preventDefault();
        const li = itemToggle.closest('.item');
        const item = li?.dataset.itemId ? sheet.actor.items.get(li.dataset.itemId) : null;
        if (!item) return;
        if (item.type === 'drug') await item.toggleActive();
        else await item.update({ 'system.equipped': !item.system.equipped });
        return;
    }

    const xpBtn = t.closest('.xp-button');
    if (xpBtn && sheet.actor.isOwner) {
        event.preventDefault();
        await XPDialog.create(sheet.actor);
        return;
    }

    if (!sheet.isEditable) return;

    const drugBtn = t.closest('.item-use-drug');
    if (drugBtn) {
        event.preventDefault();
        const li = drugBtn.closest('.item');
        const itemId = li?.dataset.itemId;
        const item = itemId ? sheet.actor.items.get(itemId) : null;
        if (!item || item.type !== 'drug') return;
        await useDrugItem(sheet, item);
        return;
    }

    const toxicantBtn = t.closest('.item-use-toxicant');
    if (toxicantBtn) {
        event.preventDefault();
        const li = toxicantBtn.closest('.item');
        const itemId = li?.dataset.itemId;
        const item = itemId ? sheet.actor.items.get(itemId) : null;
        if (!item || item.type !== 'toxicant') return;
        await item.rollInfectionTest();
        return;
    }

    const effToggle = t.closest('.sla-effect-toggle');
    if (effToggle && sheet.actor.isOwner) {
        event.preventDefault();
        const id = effToggle.dataset.effectId;
        const effect = id ? sheet.actor.effects.get(id) : null;
        if (effect) await effect.update({ disabled: !effect.disabled });
        sheet.render(false);
        return;
    }
    const effEdit = t.closest('.sla-effect-edit');
    if (effEdit && sheet.actor.isOwner) {
        event.preventDefault();
        const id = effEdit.dataset.effectId;
        const effect = id ? sheet.actor.effects.get(id) : null;
        effect?.sheet?.render(true);
        return;
    }
    const effDel = t.closest('.sla-effect-delete');
    if (effDel && sheet.actor.isOwner) {
        event.preventDefault();
        const id = effDel.dataset.effectId;
        const effect = id ? sheet.actor.effects.get(id) : null;
        if (effect) await effect.delete();
        sheet.render(false);
        return;
    }
    const effAdd = t.closest('.sla-effect-create');
    if (effAdd && sheet.actor.isOwner && sheet.isEditable) {
        event.preventDefault();
        await sheet.actor.createEmbeddedDocuments('ActiveEffect', [
            {
                name: game.i18n.localize('DOCUMENT.ActiveEffect'),
                img: 'icons/svg/aura.svg',
                disabled: false
            }
        ]);
        sheet.render(false);
        return;
    }

    const chipSpecies = t.closest('.chip-delete[data-type="species"]');
    if (chipSpecies) {
        event.preventDefault();
        event.stopPropagation();
        const speciesItem = sheet.actor.items.find((i) => i.type === 'species');
        if (!speciesItem) return;
        await confirmSheetAction(
            sheet,
            'Remove Species?',
            `<p>Remove <strong>${speciesItem.name}</strong>?</p>`,
            async () => {
                const skillsToDelete = sheet.actor.items
                    .filter((i) => i.getFlag('sla-industries', 'fromSpecies'))
                    .map((i) => i.id);
                await sheet.actor.deleteEmbeddedDocuments('Item', [speciesItem.id, ...skillsToDelete], {
                    render: false
                });
                await sheet.actor.update(buildSpeciesRemovalUpdates());
            },
            'Remove'
        );
        return;
    }

    const chipPackage = t.closest('.chip-delete[data-type="package"]');
    if (chipPackage) {
        event.preventDefault();
        event.stopPropagation();
        const packageItem = sheet.actor.items.find((i) => i.type === 'package');
        if (!packageItem) return;
        await confirmSheetAction(
            sheet,
            'Remove Package?',
            `<p>Remove <strong>${packageItem.name}</strong>?</p>`,
            async () => {
                const skillsToDelete = sheet.actor.items
                    .filter((i) => i.getFlag('sla-industries', 'fromPackage'))
                    .map((i) => i.id);
                await sheet.actor.deleteEmbeddedDocuments('Item', [packageItem.id, ...skillsToDelete], {
                    render: false
                });
                await sheet.actor.update({ 'system.bio.package': '' });
            },
            'Remove'
        );
        return;
    }

    const itemEdit = t.closest('.item-edit');
    if (itemEdit) {
        event.preventDefault();
        const li = itemEdit.closest('.item');
        const item = li?.dataset.itemId ? sheet.actor.items.get(li.dataset.itemId) : null;
        if (item) item.sheet.render(true);
        return;
    }

    const itemDelete = t.closest('.item-delete');
    if (itemDelete) {
        event.preventDefault();
        const li = itemDelete.closest('.item');
        const item = li?.dataset.itemId ? sheet.actor.items.get(li.dataset.itemId) : null;
        if (item) {
            await confirmSheetAction(
                sheet,
                'Delete Item?',
                '<p>Are you sure?</p>',
                async () => {
                    await item.delete();
                    sheet.render(false);
                },
                'Delete'
            );
        }
        return;
    }

    const itemReload = t.closest('.item-reload');
    if (itemReload) {
        await onReloadWeapon(sheet, event, itemReload);
        return;
    }

    const itemCreate = t.closest('.item-create');
    if (itemCreate) {
        await onItemCreate(sheet, event, itemCreate);
        return;
    }
}

/** @param {import('../actor-sheet.mjs').SlaActorSheet} sheet */
export async function handleSheetChange(sheet, event) {
    const root = event.currentTarget;
    if (!(root instanceof HTMLElement)) return;

    const el = event.target instanceof Element ? event.target : null;
    if (!el) return;

    const inlineInput = el.closest('.inline-edit');
    if (inlineInput) {
        if (!sheet.isEditable) return;
        event.preventDefault();
        const input = inlineInput;
        const row = input.closest('.item');
        const itemId = input.dataset.itemId || row?.dataset.itemId;
        if (!itemId) return;
        const item = sheet.actor.items.get(itemId);
        const field = input.dataset.field;
        if (item && field) await item.update({ [field]: Number(input.value) });
        return;
    }

    const woundCb = el.closest('.wound-checkbox');
    if (woundCb) {
        const field = woundCb.name;
        const isChecked = woundCb.checked;
        if (sheet.actor.type === 'npc') {
            const systemPath = field.replace('system.', '');
            const currentValue = foundry.utils.getProperty(sheet.actor.system, systemPath);
            if (currentValue === isChecked) return;
        }
        const updateData = { [field]: isChecked };
        try {
            await sheet.actor.update(updateData);
        } catch (error) {
            console.error('SLA Industries | Error updating actor:', error);
            woundCb.checked = !isChecked;
        }
    }
}
