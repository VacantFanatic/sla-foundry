/**
 * Unit tests for derived stat penalty helpers (no Foundry runtime).
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { applyStatPenalties } from "../../module/documents/derived/penalties.mjs";

describe("applyStatPenalties", () => {
    test("applies encumbrance penalty to DEX only", () => {
        const stats = { str: { total: 4 }, dex: { total: 5 }, conc: { total: 3 }, cool: { total: 2 } };
        const out = applyStatPenalties(stats, { encumbrancePenalty: 2, critical: false });
        assert.equal(out.dex.total, 3);
        assert.equal(out.str.total, 4);
    });

    test("applies critical penalties to STR, DEX, CONC, COOL", () => {
        const stats = { str: { total: 4 }, dex: { total: 5 }, conc: { total: 3 }, cool: { total: 2 } };
        const out = applyStatPenalties(stats, { encumbrancePenalty: 0, critical: true });
        assert.equal(out.str.total, 2);
        assert.equal(out.dex.total, 3);
        assert.equal(out.conc.total, 2);
        assert.equal(out.cool.total, 1);
    });

    test("stats do not drop below zero", () => {
        const stats = { str: { total: 1 }, dex: { total: 1 }, conc: { total: 0 }, cool: { total: 0 } };
        const out = applyStatPenalties(stats, { encumbrancePenalty: 0, critical: true });
        assert.equal(out.str.total, 0);
        assert.equal(out.dex.total, 0);
    });
});
