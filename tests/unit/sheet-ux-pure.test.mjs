import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    countWounds,
    hpBarState,
    isEncumbranceOverloaded,
    isEncumbranceWarning,
    normalizeOperativeTabId,
    operativeTabOrder,
    statPlayColorClass
} from '../../module/sheets/actor/sheet-ux-pure.mjs';

describe('sheet-ux-pure', () => {
    it('countWounds sums checked wound locations', () => {
        assert.equal(countWounds({ head: true, torso: false, lArm: true }), 2);
        assert.equal(countWounds(undefined), 0);
    });

    it('statPlayColorClass reflects total vs base', () => {
        assert.equal(statPlayColorClass(5, 3), 'sla-stat-buffed');
        assert.equal(statPlayColorClass(2, 4), 'sla-stat-debuffed');
        assert.equal(statPlayColorClass(4, 4), 'sla-stat-neutral');
    });

    it('hpBarState returns percent and tone thresholds', () => {
        assert.deepEqual(hpBarState(7, 10), { percent: 70, tone: 'warning' });
        assert.deepEqual(hpBarState(4, 10), { percent: 40, tone: 'critical' });
        assert.deepEqual(hpBarState(9, 10), { percent: 90, tone: 'healthy' });
        assert.deepEqual(hpBarState(0, 0), { percent: 0, tone: 'empty' });
    });

    it('encumbrance helpers detect warning and overload', () => {
        assert.equal(isEncumbranceWarning(9, 10), true);
        assert.equal(isEncumbranceOverloaded(10, 10), true);
        assert.equal(isEncumbranceWarning(5, 10), false);
    });

    it('normalizeOperativeTabId maps legacy biography tab', () => {
        assert.equal(normalizeOperativeTabId('biography'), 'traits');
        assert.equal(normalizeOperativeTabId('combat'), 'combat');
    });

    it('operativeTabOrder appends ebb only for Ebonites', () => {
        assert.deepEqual(operativeTabOrder(false), ['main', 'combat', 'inventory', 'effects', 'traits', 'notes']);
        assert.deepEqual(operativeTabOrder(true), ['main', 'combat', 'inventory', 'effects', 'traits', 'notes', 'ebb']);
    });
});
