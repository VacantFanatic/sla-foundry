import { SlaItemSheet } from '../item-sheet.mjs';

/**
 * Trait item sheet (Application V2).
 * @extends {SlaItemSheet}
 */
export class SlaTraitItemSheet extends SlaItemSheet {
    static useTwoTabs = false;
    static useCataloguePart = false;
}
