/**
 * Unit tests for derived HP-max resolution (no Foundry runtime).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveDerivedHpMax } from '../../module/documents/derived/hp.mjs';

describe('resolveDerivedHpMax', () => {
    test('character: always recomputed from base + STR, ignoring any stored value', () => {
        assert.equal(resolveDerivedHpMax({ type: 'character', hpBase: 10, strTotal: 5, storedMax: 999 }), 15);
    });

    test('npc: stored (GM-authored) max is preserved verbatim, ignoring base/STR', () => {
        // Regression test for #329
        assert.equal(resolveDerivedHpMax({ type: 'npc', hpBase: 10, strTotal: 5, storedMax: 40 }), 40);
    });

    test('npc: an explicit 0 max is preserved, not replaced by the fallback', () => {
        assert.equal(resolveDerivedHpMax({ type: 'npc', hpBase: 10, strTotal: 3, storedMax: 0 }), 0);
    });

    test('npc: falls back to base + STR only when no stored value exists yet', () => {
        assert.equal(resolveDerivedHpMax({ type: 'npc', hpBase: 12, strTotal: 4, storedMax: undefined }), 16);
    });

    test('character: hpBonus (e.g. a Gang Colours trait Active Effect) adds on top of base + STR', () => {
        assert.equal(
            resolveDerivedHpMax({ type: 'character', hpBase: 10, strTotal: 5, hpBonus: 5, storedMax: 999 }),
            20
        );
    });

    test('npc: hpBonus adds on top of the preserved stored max', () => {
        assert.equal(resolveDerivedHpMax({ type: 'npc', hpBase: 10, strTotal: 5, hpBonus: 5, storedMax: 40 }), 45);
    });

    test('omitted hpBonus defaults to 0 (backward compatible)', () => {
        assert.equal(resolveDerivedHpMax({ type: 'character', hpBase: 10, strTotal: 5, storedMax: 999 }), 15);
        assert.equal(resolveDerivedHpMax({ type: 'npc', hpBase: 10, strTotal: 5, storedMax: 40 }), 40);
    });
});
