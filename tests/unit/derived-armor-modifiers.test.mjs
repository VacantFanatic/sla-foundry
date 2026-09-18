/**
 * Unit tests for equipped-powered-armor modifier resolution (no Foundry runtime).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { computeArmorModifierEffects } from '../../module/documents/derived/armor-modifiers.mjs';

function armor({ str, dex, closing, rushing, powersuit, dexCap, initBonus, resistanceValue } = {}) {
    return {
        system: {
            mods: { str, dex, move: { closing, rushing } },
            powersuit: Boolean(powersuit),
            dexCap,
            initBonus,
            resistance: { value: resistanceValue }
        }
    };
}

describe('computeArmorModifierEffects', () => {
    test('no armor leaves str/dex untouched and zeroes accumulators', () => {
        const result = computeArmorModifierEffects({ armors: [], strTotal: 5, dexTotal: 4 });
        assert.deepEqual(result, { str: 5, dex: 4, initBonus: 0, moveBonus: { closing: 0, rushing: 0 } });
    });

    test('non-powersuit armor stacks str/dex/move additively across multiple pieces', () => {
        const armors = [
            armor({ str: 1, dex: 1, closing: 1, rushing: 2 }),
            armor({ str: 2, dex: 0, closing: 0, rushing: 1 })
        ];
        const result = computeArmorModifierEffects({ armors, strTotal: 5, dexTotal: 4 });
        assert.equal(result.str, 8); // 5 + 1 + 2
        assert.equal(result.dex, 5); // 4 + 1 + 0
        assert.deepEqual(result.moveBonus, { closing: 1, rushing: 3 });
        assert.equal(result.initBonus, 0);
    });

    test('a single active powersuit replaces str and caps dex', () => {
        const armors = [armor({ str: 10, dex: 5, powersuit: true, dexCap: 3, initBonus: 2, resistanceValue: 8 })];
        const result = computeArmorModifierEffects({ armors, strTotal: 5, dexTotal: 4 });
        assert.equal(result.str, 10); // overridden, not additive
        assert.equal(result.dex, 3); // 4 + 5 = 9, capped at 3
        assert.equal(result.initBonus, 2);
    });

    test('multiple powersuits: the one with the highest resistance.value is active', () => {
        const armors = [
            armor({ str: 10, powersuit: true, resistanceValue: 5 }),
            armor({ str: 20, powersuit: true, resistanceValue: 9 })
        ];
        const result = computeArmorModifierEffects({ armors, strTotal: 5, dexTotal: 4 });
        assert.equal(result.str, 20);
    });

    test('a non-powersuit dex mod applied after the powersuit is not re-clamped by the cap', () => {
        const armors = [armor({ str: 10, dex: 0, powersuit: true, dexCap: 3, resistanceValue: 8 }), armor({ dex: 5 })];
        const result = computeArmorModifierEffects({ armors, strTotal: 5, dexTotal: 4 });
        // Powersuit clamps dex to 3 when processed, then the second armor adds 5 on top.
        assert.equal(result.dex, 8);
    });

    test('accumulates move bonus across both powersuit and non-powersuit armor', () => {
        const armors = [
            armor({ powersuit: true, closing: 1, rushing: 1, resistanceValue: 8 }),
            armor({ closing: 2, rushing: 3 })
        ];
        const result = computeArmorModifierEffects({ armors, strTotal: 0, dexTotal: 0 });
        assert.deepEqual(result.moveBonus, { closing: 3, rushing: 4 });
    });
});
