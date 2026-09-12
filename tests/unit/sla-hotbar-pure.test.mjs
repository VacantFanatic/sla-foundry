/**
 * Unit tests for pure helpers in module/helpers/sla-hotbar.mjs (no Foundry runtime).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { actorItemMacroLabel } from '../../module/helpers/sla-hotbar.mjs';

describe('actorItemMacroLabel', () => {
    test('maps character actors to "Operative"', () => {
        assert.equal(actorItemMacroLabel({ actor: { type: 'character' } }), 'Operative');
    });

    test('maps npc actors to "Threat"', () => {
        assert.equal(actorItemMacroLabel({ actor: { type: 'npc' } }), 'Threat');
    });

    test('maps vehicle actors to "Vehicle"', () => {
        assert.equal(actorItemMacroLabel({ actor: { type: 'vehicle' } }), 'Vehicle');
    });

    test('falls back to "Actor" when unowned or an unknown type', () => {
        assert.equal(actorItemMacroLabel({ actor: null }), 'Actor');
        assert.equal(actorItemMacroLabel({ actor: { type: 'unknown' } }), 'Actor');
        assert.equal(actorItemMacroLabel({}), 'Actor');
    });
});
