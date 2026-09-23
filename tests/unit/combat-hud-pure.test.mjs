import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compactStatRows, equippedFirst, resolveHudActorId, stepIndex } from '../../module/apps/combat-hud-pure.mjs';

describe('combat-hud-pure', () => {
    describe('resolveHudActorId', () => {
        it('pin wins over everything', () => {
            assert.equal(
                resolveHudActorId({
                    pinnedId: 'p',
                    controlledActorIds: ['c'],
                    activeCombatantActorId: 'a',
                    lastId: 'l'
                }),
                'p'
            );
        });

        it('a single controlled token beats the active combatant', () => {
            assert.equal(resolveHudActorId({ controlledActorIds: ['c'], activeCombatantActorId: 'a' }), 'c');
        });

        it('duplicate tokens of the same actor still count as one', () => {
            assert.equal(resolveHudActorId({ controlledActorIds: ['c', 'c'], activeCombatantActorId: 'a' }), 'c');
        });

        it('several controlled actors fall through to the active combatant', () => {
            assert.equal(resolveHudActorId({ controlledActorIds: ['c', 'd'], activeCombatantActorId: 'a' }), 'a');
        });

        it('falls back to the last shown actor, then null', () => {
            assert.equal(resolveHudActorId({ controlledActorIds: [], lastId: 'l' }), 'l');
            assert.equal(resolveHudActorId({}), null);
            assert.equal(resolveHudActorId(), null);
        });
    });

    describe('compactStatRows', () => {
        it('lists the six core stats with totals, falling back to value', () => {
            const rows = compactStatRows({ str: { value: 2, total: 3 }, dex: { value: 4 } });
            assert.deepEqual(
                rows.map((r) => r.key),
                ['str', 'dex', 'know', 'conc', 'cha', 'cool']
            );
            assert.equal(rows[0].total, 3);
            assert.equal(rows[0].label, 'STR');
            assert.equal(rows[1].total, 4);
            assert.equal(rows[2].total, 0);
        });

        it('tolerates missing stats', () => {
            assert.equal(compactStatRows(undefined).length, 6);
        });
    });

    describe('equippedFirst', () => {
        it('moves equipped weapons to the top, keeping relative order', () => {
            const list = [
                { n: 'a', system: { equipped: false } },
                { n: 'b', system: { equipped: true } },
                { n: 'c', system: {} },
                { n: 'd', system: { equipped: true } }
            ];
            assert.deepEqual(
                equippedFirst(list).map((w) => w.n),
                ['b', 'd', 'a', 'c']
            );
        });

        it('does not mutate the input and handles non-arrays', () => {
            const list = [{ system: { equipped: false } }, { system: { equipped: true } }];
            equippedFirst(list);
            assert.equal(list[0].system.equipped, false);
            assert.deepEqual(equippedFirst(undefined), []);
        });
    });

    describe('stepIndex', () => {
        it('wraps forwards and backwards', () => {
            assert.equal(stepIndex(2, 3, 1), 0);
            assert.equal(stepIndex(0, 3, -1), 2);
            assert.equal(stepIndex(1, 3, 1), 2);
        });

        it('starts at an end when the current actor is not listed', () => {
            assert.equal(stepIndex(-1, 3, 1), 0);
            assert.equal(stepIndex(-1, 3, -1), 2);
        });

        it('returns -1 for an empty list', () => {
            assert.equal(stepIndex(0, 0, 1), -1);
        });
    });
});
