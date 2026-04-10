import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getEbbMosDamageBonus } from "../../module/helpers/ebb-mos.mjs";

describe("getEbbMosDamageBonus", () => {
    it("returns 0 when the roll is not successful", () => {
        assert.equal(getEbbMosDamageBonus(false, 4, "damage"), 0);
    });

    it("returns 0 for heal and effect formulas even at high MOS", () => {
        assert.equal(getEbbMosDamageBonus(true, 4, "heal"), 0);
        assert.equal(getEbbMosDamageBonus(true, 3, "effect"), 0);
        assert.equal(getEbbMosDamageBonus(true, 2, "none"), 0);
    });

    it("returns +1 / +2 / +4 for damage at 2 / 3 / 4+ skill successes", () => {
        assert.equal(getEbbMosDamageBonus(true, 1, "damage"), 0);
        assert.equal(getEbbMosDamageBonus(true, 2, "damage"), 1);
        assert.equal(getEbbMosDamageBonus(true, 3, "damage"), 2);
        assert.equal(getEbbMosDamageBonus(true, 4, "damage"), 4);
        assert.equal(getEbbMosDamageBonus(true, 5, "damage"), 4);
    });
});
