import { incrementSkillRank } from '../../helpers/items.mjs';
import { handleStackableActorItemDrop } from '../../helpers/inventory-stack.mjs';
import {
    buildGrantedSkillPayload,
    buildSpeciesStatUpdates,
    shouldAutoEquipDroppedItem,
    validatePackageRequirements
} from './actor-drops-pure.mjs';

/**
 * @param {import('../actor-sheet.mjs').SlaActorSheet} sheet
 */
export async function processDroppedSkills(sheet, skillsArray, sourceFlag) {
    if (!skillsArray || !Array.isArray(skillsArray) || skillsArray.length === 0) return;

    const toCreate = [];
    const toUpdate = [];
    const skillStats = CONFIG.SLA?.skillStats || {};

    for (const skillData of skillsArray) {
        if (!skillData || !skillData.name) continue;

        const existingSkill = sheet.actor.items.find(
            (i) => i.type === 'skill' && i.name.toLowerCase() === skillData.name.toLowerCase()
        );

        if (existingSkill) {
            const currentRank = Number(existingSkill.system?.rank) || 0;
            const newRank = incrementSkillRank(currentRank);
            toUpdate.push({ _id: existingSkill.id, 'system.rank': newRank });
            ui.notifications.info(`Upgraded ${existingSkill.name} to Rank ${newRank}`);
            continue;
        }

        toCreate.push(buildGrantedSkillPayload(skillData, sourceFlag, skillStats));
    }

    if (toCreate.length > 0) {
        await sheet.actor.createEmbeddedDocuments('Item', toCreate);
    }
    if (toUpdate.length > 0) {
        await sheet.actor.updateEmbeddedDocuments('Item', toUpdate);
    }
}

async function replaceSingletonItemAndLinkedSkills(sheet, itemType, linkedSkillFlag) {
    const existing = sheet.actor.items.find((i) => i.type === itemType);
    if (!existing) return;

    const linkedSkills = sheet.actor.items.filter((i) => i.getFlag('sla-industries', linkedSkillFlag));
    const idsToDelete = [existing.id, ...linkedSkills.map((i) => i.id)];
    await sheet.actor.deleteEmbeddedDocuments('Item', idsToDelete);
}

/**
 * @param {import('../actor-sheet.mjs').SlaActorSheet} sheet
 */
export async function handleSpeciesDrop(sheet, itemData) {
    await replaceSingletonItemAndLinkedSkills(sheet, 'species', 'fromSpecies');
    await sheet.actor.createEmbeddedDocuments('Item', [itemData]);
    await sheet.actor.update({ 'system.bio.species': itemData.name });

    const statUpdates = buildSpeciesStatUpdates(itemData.system.stats);
    if (Object.keys(statUpdates).length) {
        await sheet.actor.update(statUpdates);
    }

    await processDroppedSkills(sheet, itemData.system.skills, 'fromSpecies');
}

/**
 * @param {import('../actor-sheet.mjs').SlaActorSheet} sheet
 */
export async function handlePackageDrop(sheet, itemData) {
    const validation = validatePackageRequirements(itemData.system.requirements, sheet.actor.system.stats);
    if (!validation.valid) {
        ui.notifications.error(
            `Requirement not met: ${validation.failedKey.toUpperCase()} must be ${validation.minVal}+`
        );
        return;
    }

    await replaceSingletonItemAndLinkedSkills(sheet, 'package', 'fromPackage');
    await sheet.actor.createEmbeddedDocuments('Item', [itemData]);
    await sheet.actor.update({ 'system.bio.package': itemData.name });
    await processDroppedSkills(sheet, itemData.system.skills, 'fromPackage');
}

async function createEquippedItem(sheet, itemData) {
    foundry.utils.setProperty(itemData, 'system.equipped', true);
    return sheet.actor.createEmbeddedDocuments('Item', [itemData]);
}

/**
 * @param {import('../actor-sheet.mjs').SlaActorSheet} sheet
 */
export async function onDropItem(sheet, event, data) {
    if (!sheet.actor.isOwner) return false;
    const item = await Item.implementation.fromDropData(data);
    if (!item) return false;
    const itemData = item.toObject();

    if (itemData.type === 'species') {
        await handleSpeciesDrop(sheet, itemData);
        return;
    }

    if (itemData.type === 'package') {
        await handlePackageDrop(sheet, itemData);
        return;
    }

    if (shouldAutoEquipDroppedItem(sheet.actor.type, itemData.type)) {
        return createEquippedItem(sheet, itemData);
    }

    const stacked = await handleStackableActorItemDrop(sheet.actor, itemData);
    if (stacked) return true;

    return null;
}

/**
 * @param {import('../actor-sheet.mjs').SlaActorSheet} sheet
 */
export async function onDropVehicleWeapon(sheet, event) {
    event.preventDefault();
    if (!sheet.actor.isOwner || sheet.actor.type !== 'vehicle') return false;

    let dropped;
    try {
        const dt = event.dataTransfer ?? event.originalEvent?.dataTransfer;
        dropped = JSON.parse(dt?.getData('text/plain') ?? '{}');
    } catch (_err) {
        return false;
    }
    if (!dropped || dropped.type !== 'Item') return false;

    const item = await Item.implementation.fromDropData(dropped);
    if (!item || item.type !== 'weapon') {
        ui.notifications.warn('Only weapon items can be dropped into vehicle weapons.');
        return false;
    }

    const itemData = item.toObject();
    await createEquippedItem(sheet, itemData);
    ui.notifications.info(`Equipped ${itemData.name} on ${sheet.actor.name}.`);
    return true;
}

/**
 * @param {import('../actor-sheet.mjs').SlaActorSheet} sheet
 */
export async function onItemCreate(sheet, event, createEl) {
    event.preventDefault();
    const header = createEl ?? event.currentTarget;
    const type = header.dataset.type;
    const name = `New ${type.capitalize()}`;
    const itemData = { name: name, type: type };
    return await Item.create(itemData, { parent: sheet.actor });
}
