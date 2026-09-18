/**
 * Unit tests for pure initiative/movement resolution (no Foundry runtime).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { computeInitiativeBonus, computeMovement } from '../../module/documents/derived/movement.mjs';
import { computeActiveEffectKeyValue } from '../../module/documents/derived/active-effects.mjs';

describe('computeInitiativeBonus', () => {
    test('sums dex, conc, and armor init bonus', () => {
        assert.equal(computeInitiativeBonus({ dexTotal: 4, concTotal: 3, armorInitBonus: 2 }), 9);
    });

    test('treats missing values as zero', () => {
        assert.equal(computeInitiativeBonus({ dexTotal: 0, concTotal: 0, armorInitBonus: 0 }), 0);
    });
});

const baseMovementParams = () => ({
    speciesClosing: 2,
    speciesRushing: 5,
    athleticsRank: 0,
    armorMoveBonus: { closing: 0, rushing: 0 },
    critical: false,
    stunned: false,
    encumbranceMoveCap: null,
    immobile: false,
    dead: false
});

describe('computeMovement', () => {
    test('uses species base move when nothing else applies', () => {
        const result = computeMovement(baseMovementParams());
        assert.deepEqual(result, { closing: 2, rushing: 5 });
    });

    test('athletics adds +1 rushing per 2 ranks, floored', () => {
        const result = computeMovement({ ...baseMovementParams(), athleticsRank: 5 });
        assert.equal(result.rushing, 5 + 2); // floor(5/2) = 2
    });

    test('armor move bonus accumulates onto both closing and rushing', () => {
        const result = computeMovement({
            ...baseMovementParams(),
            armorMoveBonus: { closing: 1, rushing: 2 }
        });
        assert.deepEqual(result, { closing: 3, rushing: 7 });
    });

    test('active effect bonus accumulates onto both closing and rushing (issue #373)', () => {
        const result = computeMovement({
            ...baseMovementParams(),
            aeClosingBonus: 1,
            aeRushingBonus: 1
        });
        assert.deepEqual(result, { closing: 3, rushing: 6 });
    });

    test('active effect bonus is still capped by critical/stunned rushing-to-closing rule', () => {
        const result = computeMovement({
            ...baseMovementParams(),
            aeRushingBonus: 10,
            critical: true
        });
        assert.equal(result.rushing, result.closing);
    });

    test('active effect bonus is still limited by encumbrance move cap', () => {
        const result = computeMovement({
            ...baseMovementParams(),
            aeRushingBonus: 10,
            encumbranceMoveCap: 1
        });
        assert.equal(result.rushing, 1);
    });

    test('active effect bonus is still zeroed when immobile', () => {
        const result = computeMovement({
            ...baseMovementParams(),
            aeClosingBonus: 5,
            aeRushingBonus: 5,
            immobile: true
        });
        assert.deepEqual(result, { closing: 0, rushing: 0 });
    });

    test('critical caps rushing to closing', () => {
        const result = computeMovement({ ...baseMovementParams(), critical: true });
        assert.equal(result.rushing, result.closing);
    });

    test('stunned caps rushing to closing', () => {
        const result = computeMovement({ ...baseMovementParams(), stunned: true });
        assert.equal(result.rushing, result.closing);
    });

    test('encumbrance move cap limits rushing', () => {
        const result = computeMovement({ ...baseMovementParams(), encumbranceMoveCap: 1 });
        assert.equal(result.rushing, 1);
    });

    test('a null encumbrance move cap does not limit rushing', () => {
        const result = computeMovement({ ...baseMovementParams(), encumbranceMoveCap: null });
        assert.equal(result.rushing, 5);
    });

    test('immobile zeroes both closing and rushing', () => {
        const result = computeMovement({ ...baseMovementParams(), immobile: true });
        assert.deepEqual(result, { closing: 0, rushing: 0 });
    });

    test('dead zeroes both closing and rushing', () => {
        const result = computeMovement({ ...baseMovementParams(), dead: true });
        assert.deepEqual(result, { closing: 0, rushing: 0 });
    });
});

describe('issue #373 regression: Ebb Formulae Active Effect changes on move.closing/rushing', () => {
    test('an Add-mode effect targeting system.move.closing/rushing directly survives the recompute', () => {
        // Reproduces the exact repro steps from #373: an effect with changes on
        // system.move.closing and system.move.rushing (mode ADD, value 1), resolved via
        // computeActiveEffectKeyValue exactly as actor.mjs's _calculateDerived does, then folded
        // into computeMovement instead of being clobbered by it.
        const effects = [
            {
                disabled: false,
                changes: [
                    { key: 'system.move.rushing', type: 'add', value: 1 },
                    { key: 'system.move.closing', type: 'add', value: 1 }
                ]
            }
        ];

        const aeClosingBonus = computeActiveEffectKeyValue(effects, 'system.move.closing', 0);
        const aeRushingBonus = computeActiveEffectKeyValue(effects, 'system.move.rushing', 0);

        const result = computeMovement({ ...baseMovementParams(), aeClosingBonus, aeRushingBonus });
        assert.deepEqual(result, { closing: 3, rushing: 6 });
    });

    test('a disabled effect targeting move.closing/rushing contributes nothing', () => {
        const effects = [
            {
                disabled: true,
                changes: [
                    { key: 'system.move.rushing', type: 'add', value: 1 },
                    { key: 'system.move.closing', type: 'add', value: 1 }
                ]
            }
        ];

        const aeClosingBonus = computeActiveEffectKeyValue(effects, 'system.move.closing', 0);
        const aeRushingBonus = computeActiveEffectKeyValue(effects, 'system.move.rushing', 0);

        const result = computeMovement({ ...baseMovementParams(), aeClosingBonus, aeRushingBonus });
        assert.deepEqual(result, { closing: 2, rushing: 5 });
    });
});
