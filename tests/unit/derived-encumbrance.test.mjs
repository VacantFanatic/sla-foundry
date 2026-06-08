/**
 * Unit tests for derived encumbrance helpers (no Foundry runtime).
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
    computeCarriedItemWeight,
    computeEncumbranceState,
    computeEffectiveArmorPv
} from "../../module/documents/derived/encumbrance.mjs";

describe("computeCarriedItemWeight", () => {
    test("multiplies weight by quantity", () => {
        const w = computeCarriedItemWeight({ type: "item", system: { weight: 2, quantity: 3 } });
        assert.equal(w, 6);
    });

    test("destroyed powered armor counts as 6 weight", () => {
        const w = computeCarriedItemWeight({
            type: "armor",
            system: { weight: 1, quantity: 1, powered: true, resistance: { value: 0, max: 10 } }
        });
        assert.equal(w, 6);
    });

    test("intact powered armor uses nominal weight", () => {
        const w = computeCarriedItemWeight({
            type: "armor",
            system: { weight: 4, quantity: 1, powered: true, resistance: { value: 5, max: 10 } }
        });
        assert.equal(w, 4);
    });
});

describe("computeEncumbranceState", () => {
    test("max carry is max(8, STR × 3)", () => {
        const s = computeEncumbranceState(0, 2);
        assert.equal(s.max, 8);
        assert.equal(s.penalty, 0);
    });

    test("1 remaining capacity applies -1 DEX and rushing cap 1", () => {
        const s = computeEncumbranceState(11, 4);
        assert.equal(s.max, 12);
        assert.equal(s.penalty, 1);
        assert.equal(s.moveCap, 1);
        assert.equal(s.immobile, false);
    });

    test("0 remaining capacity applies -2 DEX and rushing cap 1", () => {
        const s = computeEncumbranceState(12, 4);
        assert.equal(s.penalty, 2);
        assert.equal(s.moveCap, 1);
    });

    test("over capacity marks immobile", () => {
        const s = computeEncumbranceState(13, 4);
        assert.equal(s.immobile, true);
    });
});

describe("computeEffectiveArmorPv", () => {
    test("returns max of base and equipped armor PV", () => {
        assert.equal(computeEffectiveArmorPv(2, 5), 5);
        assert.equal(computeEffectiveArmorPv(10, 5), 10);
    });
});
