/**
 * Unit regression tests for skill rank arithmetic (no Foundry runtime).
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { incrementSkillRank } from "../../module/helpers/items.mjs";

describe("incrementSkillRank", () => {
    test("increments string ranks numerically (not concatenation)", () => {
        assert.equal(incrementSkillRank("1"), "2");
        assert.equal(incrementSkillRank("10"), "11");
    });

    test("handles missing or invalid ranks as zero", () => {
        assert.equal(incrementSkillRank(undefined), "1");
        assert.equal(incrementSkillRank(null), "1");
        assert.equal(incrementSkillRank(""), "1");
        assert.equal(incrementSkillRank("abc"), "1");
    });

    test("accepts numeric input", () => {
        assert.equal(incrementSkillRank(2), "3");
    });
});
