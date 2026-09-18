import { SlaItemSheet } from '../item-sheet.mjs';

/**
 * Package item sheet (Application V2).
 * @extends {SlaItemSheet}
 */
export class SlaPackageItemSheet extends SlaItemSheet {
    static useTwoTabs = true;
    static useCataloguePart = false;
}
