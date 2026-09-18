import { SlaItemSheet } from '../item-sheet.mjs';

/**
 * Armor item sheet (Application V2).
 * @extends {SlaItemSheet}
 */
export class SlaArmorItemSheet extends SlaItemSheet {
    static useTwoTabs = true;
    static useCataloguePart = true;

    /** @override */
    async _prepareTypeContext(context) {
        const max = Number(this.item.system.resistance?.max) || 0;
        const cur = Number(this.item.system.resistance?.value) || 0;
        context.resistGaugePct = max > 0 ? Math.min(100, Math.round((cur / max) * 100)) : 0;
        return context;
    }
}
