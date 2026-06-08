/**
 * Tests for legacy natural weapon detection (no Foundry runtime).
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { classifyLegacyNaturalWeapon } from "../../module/migration/natural-weapons.mjs";

/** @param {string} name @param {string} damage */
function weapon(name, damage) {
    return { type: "weapon", name, system: { damage } };
}

describe("classifyLegacyNaturalWeapon", () => {
    test("ignores non-weapon items", () => {
        const r = classifyLegacyNaturalWeapon({ type: "skill", name: "Punch/Kick", system: { damage: "1d10" } });
        assert.equal(r.isLegacy, false);
        assert.equal(r.replacementKey, null);
    });

    test("ignores weapons without legacy 1d10 damage", () => {
        const r = classifyLegacyNaturalWeapon(weapon("Punch/Kick", "1d6+1"));
        assert.equal(r.isLegacy, false);
    });

    test("detects legacy Stormer teeth/claws", () => {
        const r = classifyLegacyNaturalWeapon(weapon("Teeth/Claws (Stormer)", "1d10"));
        assert.equal(r.isLegacy, true);
        assert.equal(r.replacementKey, "teethClaws");
    });

    test("detects legacy Neophron beak", () => {
        const r = classifyLegacyNaturalWeapon(weapon("Beak (Neophron)", "1d10+1"));
        assert.equal(r.isLegacy, true);
        assert.equal(r.replacementKey, "beak");
    });

    test("detects legacy Punch/Kick", () => {
        const r = classifyLegacyNaturalWeapon(weapon("Punch/Kick", "1d10"));
        assert.equal(r.isLegacy, true);
        assert.equal(r.replacementKey, "punchKick");
    });
});
