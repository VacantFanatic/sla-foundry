import { SlaItemSheet } from '../item-sheet.mjs';
import { prepareFiringModes } from '../../helpers/item-sheet.mjs';

/**
 * Weapon item sheet (Application V2).
 * @extends {SlaItemSheet}
 */
export class SlaWeaponItemSheet extends SlaItemSheet {
    static useTwoTabs = true;
    static useCataloguePart = true;

    /** @override */
    async _prepareTypeContext(context) {
        context.firingModes = prepareFiringModes(this.item.system);
        return context;
    }
}
