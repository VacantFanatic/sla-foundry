/**
 * @param {import('../actor-sheet.mjs').SlaActorSheet} sheet
 * @param {Item} item
 */
export async function useDrugItem(sheet, item) {
    if (!item || item.type !== 'drug' || item.actor?.id !== sheet.actor.id) return;
    const currentQty = item.system.quantity || 0;
    if (currentQty <= 0) {
        await item.delete();
        return;
    }
    const newQty = currentQty - 1;
    const templateData = {
        itemName: item.name.toUpperCase(),
        actorName: sheet.actor.name,
        duration: item.system.duration || 'Unknown',
        remaining: newQty
    };
    const content = await foundry.applications.handlebars.renderTemplate(
        'systems/sla-industries/templates/chat/drug-use.hbs',
        templateData
    );
    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: sheet.actor }),
        content: content
    });
    await item.applyItemEffectsToActor(sheet.actor);

    if (newQty <= 0) {
        await item.delete();
        ui.notifications.info(`Used the last dose of ${item.name}.`);
    } else {
        await item.update({ 'system.quantity': newQty });
    }
}

/**
 * @param {import('../actor-sheet.mjs').SlaActorSheet} sheet
 * @param {Item} item
 */
export async function triggerItemRoll(sheet, item) {
    if (!item || item.actor?.id !== sheet.actor.id) return;

    if (item.type === 'weapon') {
        const attackType = item.system.attackType || 'melee';
        const isMelee = attackType === 'melee';
        if (!sheet._canProceedWithWeaponAttack(item, { requireTarget: true })) return;
        await sheet._renderAttackDialog(item, isMelee);
    } else if (item.type === 'explosive') {
        await sheet._renderExplosiveDialog(item);
    } else if (item.type === 'ebbFormula') {
        await sheet._executeEbbRoll(item);
    } else if (item.type === 'drug') {
        await useDrugItem(sheet, item);
    } else if (item.type === 'toxicant') {
        await item.rollInfectionTest();
    } else if (item.type === 'skill') {
        await sheet._executeSkillRollFromItem(item);
    } else {
        item.sheet?.render(true);
    }
}
