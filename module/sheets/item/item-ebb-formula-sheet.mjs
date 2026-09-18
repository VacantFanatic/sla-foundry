import { SlaItemSheet } from '../item-sheet.mjs';
import { getLinkedDisciplineImage } from '../../helpers/item-sheet.mjs';
import { normalizeEbbEffect } from '../../helpers/items.mjs';

/**
 * Ebb Formula item sheet (Application V2).
 * @extends {SlaItemSheet}
 */
export class SlaEbbFormulaItemSheet extends SlaItemSheet {
    static useTwoTabs = false;
    static useCataloguePart = false;

    /** @override */
    async _prepareTypeContext(context) {
        context.linkedDisciplineImg = getLinkedDisciplineImage(this.item);
        context.normalizedEbbEffect = normalizeEbbEffect(this.item.system.ebbEffect);
        return context;
    }
}
