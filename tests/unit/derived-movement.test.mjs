/**
 * Unit tests for pure initiative/movement resolution (no Foundry runtime).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { computeInitiativeBonus, computeMovement } from '../../module/documents/derived/movement.mjs';

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
