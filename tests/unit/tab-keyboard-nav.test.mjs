/**
 * Unit tests for the WAI-ARIA APG "Tabs" keyboard-navigation pure logic (no DOM).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTabKeyNavIndex } from '../../module/helpers/tab-keyboard-nav.mjs';

describe('resolveTabKeyNavIndex', () => {
    test('ArrowRight/ArrowDown move to the next tab', () => {
        assert.equal(resolveTabKeyNavIndex('ArrowRight', 0, 5), 1);
        assert.equal(resolveTabKeyNavIndex('ArrowDown', 2, 5), 3);
    });

    test('ArrowRight wraps from the last tab to the first', () => {
        assert.equal(resolveTabKeyNavIndex('ArrowRight', 4, 5), 0);
    });

    test('ArrowLeft/ArrowUp move to the previous tab', () => {
        assert.equal(resolveTabKeyNavIndex('ArrowLeft', 2, 5), 1);
        assert.equal(resolveTabKeyNavIndex('ArrowUp', 4, 5), 3);
    });

    test('ArrowLeft wraps from the first tab to the last', () => {
        assert.equal(resolveTabKeyNavIndex('ArrowLeft', 0, 5), 4);
    });

    test('Home jumps to the first tab, End jumps to the last', () => {
        assert.equal(resolveTabKeyNavIndex('Home', 3, 7), 0);
        assert.equal(resolveTabKeyNavIndex('End', 0, 7), 6);
    });

    test('unrelated keys return null', () => {
        assert.equal(resolveTabKeyNavIndex('Tab', 1, 5), null);
        assert.equal(resolveTabKeyNavIndex('Enter', 1, 5), null);
        assert.equal(resolveTabKeyNavIndex('a', 1, 5), null);
    });

    test('returns null when there are no tabs', () => {
        assert.equal(resolveTabKeyNavIndex('ArrowRight', 0, 0), null);
    });

    test('single-tab rail wraps to itself', () => {
        assert.equal(resolveTabKeyNavIndex('ArrowRight', 0, 1), 0);
        assert.equal(resolveTabKeyNavIndex('ArrowLeft', 0, 1), 0);
    });
});
