/**
 * Unit tests for derived wound helpers (no Foundry runtime).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
    countWounds,
    deriveLogicConditions,
    resolveStunnedFromHeadWound,
    shouldSuppressBleeding
} from '../../module/documents/derived/wounds.mjs';

describe('countWounds', () => {
    test('counts true wound flags only', () => {
        assert.equal(countWounds({ head: true, torso: false, lArm: true, rArm: false, lLeg: false, rLeg: false }), 2);
    });

    test('returns 0 for empty wounds', () => {
        assert.equal(countWounds({}), 0);
    });
});

describe('deriveLogicConditions', () => {
    test('dead at 0 HP', () => {
        const c = deriveLogicConditions(
            { head: false, lLeg: false, rLeg: false },
            {
                hpValue: 0,
                woundCount: 0,
                projectedHpMax: 20
            }
        );
        assert.equal(c.dead, true);
        assert.equal(c.critical, false);
    });

    test('dead at 6 wounds', () => {
        const c = deriveLogicConditions({}, { hpValue: 5, woundCount: 6, projectedHpMax: 20 });
        assert.equal(c.dead, true);
    });

    test('critical when HP is at or below half max and not dead', () => {
        const c = deriveLogicConditions({}, { hpValue: 10, woundCount: 0, projectedHpMax: 20 });
        assert.equal(c.critical, true);
        assert.equal(c.dead, false);
    });

    test('head wound forces stunned; both legs force immobile', () => {
        const c = deriveLogicConditions(
            { head: true, lLeg: true, rLeg: true },
            { hpValue: 15, woundCount: 3, projectedHpMax: 20 }
        );
        assert.equal(c.stunned, true);
        assert.equal(c.immobile, true);
    });
});

describe('resolveStunnedFromHeadWound', () => {
    test('applies stunned when head is wounded and not already stunned', () => {
        assert.equal(resolveStunnedFromHeadWound(true, false), true);
    });

    test('clears stunned when head is not wounded and currently stunned', () => {
        assert.equal(resolveStunnedFromHeadWound(false, true), false);
    });

    test('no change when head wound state already matches stunned state', () => {
        assert.equal(resolveStunnedFromHeadWound(true, true), null);
        assert.equal(resolveStunnedFromHeadWound(false, false), null);
    });
});

describe('shouldSuppressBleeding', () => {
    test('suppresses bleeding for a Frother with exactly one wound', () => {
        assert.equal(shouldSuppressBleeding('Frother', 1), true);
    });

    test('is case-insensitive on species name', () => {
        assert.equal(shouldSuppressBleeding('FROTHER', 1), true);
    });

    test('does not suppress for a non-Frother species', () => {
        assert.equal(shouldSuppressBleeding('Human', 1), false);
    });

    test('does not suppress a Frother with zero wounds', () => {
        assert.equal(shouldSuppressBleeding('Frother', 0), false);
    });

    test('does not suppress a Frother with more than one wound', () => {
        assert.equal(shouldSuppressBleeding('Frother', 2), false);
    });

    test('handles a missing species name', () => {
        assert.equal(shouldSuppressBleeding(undefined, 1), false);
    });
});
