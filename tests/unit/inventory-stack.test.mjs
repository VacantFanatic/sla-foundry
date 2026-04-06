/**
 * Unit regression tests for stackable inventory identity (no Foundry runtime).
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { stackKey, isStackableItemType, STACKABLE_ITEM_TYPES } from "../../module/helpers/inventory-stack.mjs";

describe("inventory-stack", () => {
    test("isStackableItemType matches documented types", () => {
        assert.equal(isStackableItemType("item"), true);
        assert.equal(isStackableItemType("explosive"), true);
        assert.equal(isStackableItemType("magazine"), true);
        assert.equal(isStackableItemType("drug"), true);
        assert.equal(isStackableItemType("weapon"), false);
        assert.equal(STACKABLE_ITEM_TYPES.size, 4);
    });

    test("stackKey uses compendium source when present", () => {
        const plain = {
            type: "item",
            name: "Widget",
            _stats: { compendiumSource: "Compendium.sla.xxx.Item.abc123" }
        };
        assert.equal(stackKey(plain), "r|item|Compendium.sla.xxx.Item.abc123");
    });

    test("stackKey falls back to type + name for items", () => {
        const plain = { type: "item", name: "  Bandage  " };
        assert.equal(stackKey(plain), "f|item|bandage");
    });

    test("stackKey magazine fallback includes ammo fields", () => {
        const plain = {
            type: "magazine",
            name: "Clip",
            system: { ammoType: "9mm", ammoCapacity: 15 }
        };
        assert.equal(stackKey(plain), "f|magazine|clip|9mm|15");
    });

    test("stackKey returns null for non-stackable types", () => {
        assert.equal(stackKey({ type: "weapon", name: "Gun" }), null);
    });
});
