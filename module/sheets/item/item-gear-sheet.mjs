import { SlaItemSheet } from '../item-sheet.mjs';

/**
 * Generic gear item sheet (Application V2) — item type `'item'`.
 * @extends {SlaItemSheet}
 */
export class SlaGearItemSheet extends SlaItemSheet {
    static useTwoTabs = false;
    static useCataloguePart = true;
}
