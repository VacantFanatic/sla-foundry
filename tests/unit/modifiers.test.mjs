/**
 * Unit tests for melee attack modifier calculations (no Foundry runtime).
 *
 * Spec: DEVELOPER.md §Combat Flow — melee modifier rules from the rulebook
 * (STR 1-4 = no modifier, STR 5 = +1, STR 6 = +2, STR 7+ = +4)
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { applyMeleeModifiers } from '../../module/helpers/modifiers.mjs';

function makeMods() {
    return { damage: 0, successDie: 0, allDice: 0, autoSkillSuccesses: 0, reservedDice: 0 };
}

// ─── STR damage bonus breakpoints ────────────────────────────────────────────

describe('applyMeleeModifiers — STR damage bonus (rulebook breakpoints)', () => {
    test('STR 1 gives no bonus', () => {
        const m = makeMods();
        applyMeleeModifiers({}, 1, m);
        assert.equal(m.damage, 0);
    });

    test('STR 4 gives no bonus (upper edge of zero-bonus range)', () => {
        const m = makeMods();
        applyMeleeModifiers({}, 4, m);
        assert.equal(m.damage, 0);
    });

    test('STR 5 gives +1 damage', () => {
        const m = makeMods();
        applyMeleeModifiers({}, 5, m);
        assert.equal(m.damage, 1);
    });

    test('STR 6 gives +2 damage', () => {
        const m = makeMods();
        applyMeleeModifiers({}, 6, m);
        assert.equal(m.damage, 2);
    });

    test('STR 7 gives +4 damage', () => {
        const m = makeMods();
        applyMeleeModifiers({}, 7, m);
        assert.equal(m.damage, 4);
    });

    test('STR 10 gives +4 damage (cap applies beyond 7)', () => {
        const m = makeMods();
        applyMeleeModifiers({}, 10, m);
        assert.equal(m.damage, 4);
    });
});

// ─── Checkbox modifiers ───────────────────────────────────────────────────────

describe('applyMeleeModifiers — checkbox modifiers', () => {
    test('charging: −1 Success Die, +1 auto skill success', () => {
        const m = makeMods();
        applyMeleeModifiers({ charging: { checked: true } }, 3, m);
        assert.equal(m.successDie, -1);
        assert.equal(m.autoSkillSuccesses, 1);
    });

    test('charging unchecked: no change', () => {
        const m = makeMods();
        applyMeleeModifiers({ charging: { checked: false } }, 3, m);
        assert.equal(m.successDie, 0);
        assert.equal(m.autoSkillSuccesses, 0);
    });

    test('targetCharged: −1 Success Die', () => {
        const m = makeMods();
        applyMeleeModifiers({ targetCharged: { checked: true } }, 3, m);
        assert.equal(m.successDie, -1);
        assert.equal(m.autoSkillSuccesses, 0);
    });

    test('sameTarget: +1 Success Die', () => {
        const m = makeMods();
        applyMeleeModifiers({ sameTarget: { checked: true } }, 3, m);
        assert.equal(m.successDie, 1);
    });

    test('breakOff: +1 Success Die', () => {
        const m = makeMods();
        applyMeleeModifiers({ breakOff: { checked: true } }, 3, m);
        assert.equal(m.successDie, 1);
    });

    test('natural weapons: +1 Success Die', () => {
        const m = makeMods();
        applyMeleeModifiers({ natural: { checked: true } }, 3, m);
        assert.equal(m.successDie, 1);
    });

    test('prone/stunned/immobile target: +2 Success Die', () => {
        const m = makeMods();
        applyMeleeModifiers({ prone: { checked: true } }, 3, m);
        assert.equal(m.successDie, 2);
    });
});

// ─── Defence reductions ───────────────────────────────────────────────────────

describe('applyMeleeModifiers — defence reductions', () => {
    test('Combat Defence rank 2: −2 to all dice', () => {
        const m = makeMods();
        applyMeleeModifiers({ combatDef: { value: '2' } }, 3, m);
        assert.equal(m.allDice, -2);
    });

    test('Acrobatic Defence rank 3: −6 to all dice (×2 per rank)', () => {
        const m = makeMods();
        applyMeleeModifiers({ acroDef: { value: '3' } }, 3, m);
        assert.equal(m.allDice, -6);
    });

    test('Combat Defence 0 and Acrobatic Defence 0: no penalty', () => {
        const m = makeMods();
        applyMeleeModifiers({ combatDef: { value: '0' }, acroDef: { value: '0' } }, 3, m);
        assert.equal(m.allDice, 0);
    });

    test('both defences stack', () => {
        const m = makeMods();
        applyMeleeModifiers({ combatDef: { value: '1' }, acroDef: { value: '2' } }, 3, m);
        assert.equal(m.allDice, -5); // −1 + (−2 × 2)
    });
});

// ─── Reserved dice ────────────────────────────────────────────────────────────

describe('applyMeleeModifiers — reserved dice', () => {
    test('reads reservedDice from form', () => {
        const m = makeMods();
        applyMeleeModifiers({ reservedDice: { value: '3' } }, 3, m);
        assert.equal(m.reservedDice, 3);
    });

    test('defaults reservedDice to 0 when absent', () => {
        const m = makeMods();
        applyMeleeModifiers({}, 3, m);
        assert.equal(m.reservedDice, 0);
    });

    test('non-numeric reservedDice defaults to 0', () => {
        const m = makeMods();
        applyMeleeModifiers({ reservedDice: { value: 'abc' } }, 3, m);
        assert.equal(m.reservedDice, 0);
    });
});

// ─── Stacked / combined modifier scenarios ────────────────────────────────────

describe('applyMeleeModifiers — combined scenarios', () => {
    test('charging frother (STR 7) vs prone target: net SD +2, damage +4, autoHit +1', () => {
        const m = makeMods();
        applyMeleeModifiers(
            {
                charging: { checked: true }, // −1 SD, +1 autoSkillSuccesses
                prone: { checked: true }      // +2 SD
            },
            7, // STR 7 → +4 damage
            m
        );
        assert.equal(m.successDie, 1);          // −1 + 2
        assert.equal(m.damage, 4);
        assert.equal(m.autoSkillSuccesses, 1);
    });

    test('no modifiers at all: all values remain zero', () => {
        const m = makeMods();
        applyMeleeModifiers({}, 3, m);
        assert.equal(m.damage, 0);
        assert.equal(m.successDie, 0);
        assert.equal(m.allDice, 0);
        assert.equal(m.autoSkillSuccesses, 0);
        assert.equal(m.reservedDice, 0);
    });

    test('empty form object leaves all mods at zero — no checkboxes, no defence inputs', () => {
        const m = makeMods();
        applyMeleeModifiers({}, 3, m);
        assert.equal(m.successDie, 0);
        assert.equal(m.allDice, 0);
        assert.equal(m.autoSkillSuccesses, 0);
        assert.equal(m.reservedDice, 0);
    });
});
