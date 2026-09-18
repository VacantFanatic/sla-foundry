import { SlaItemSheet } from '../item-sheet.mjs';

/**
 * Drug item sheet (Application V2).
 * @extends {SlaItemSheet}
 */
export class SlaDrugItemSheet extends SlaItemSheet {
    static useTwoTabs = false;
    static useCataloguePart = true;
}
