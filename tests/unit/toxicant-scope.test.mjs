/**
 * Unit tests for toxicant immunity scope tracking (no Foundry runtime).
 *
 * Spec: module/helpers/toxicant-scope.mjs
 * Scope is per-combat when combat is started, otherwise per-scene.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

// game is accessed inside function bodies — safe to set before calling
globalThis.game = {
    combat: null,
    scenes: { current: { id: 'scene-abc' }, active: { id: 'scene-abc' } }
};

import { getSlaEncounterScopeId, isToxicantImmuneThisEncounter } from '../../module/helpers/toxicant-scope.mjs';

// ─── getSlaEncounterScopeId ───────────────────────────────────────────────────

describe('getSlaEncounterScopeId', () => {
    test('returns scene scope when there is no active combat', () => {
        globalThis.game.combat = null;
        assert.equal(getSlaEncounterScopeId(), 'scene:scene-abc');
    });

    test('returns combat scope when combat exists and has started', () => {
        globalThis.game.combat = { started: true, id: 'combat-xyz' };
        assert.equal(getSlaEncounterScopeId(), 'combat:combat-xyz');
    });

    test('returns scene scope when combat exists but has not started yet', () => {
        globalThis.game.combat = { started: false, id: 'combat-xyz' };
        assert.equal(getSlaEncounterScopeId(), 'scene:scene-abc');
    });

    test('returns scene scope using active scene when current scene is null', () => {
        globalThis.game.combat = null;
        globalThis.game.scenes = { current: null, active: { id: 'active-scene' } };
        assert.equal(getSlaEncounterScopeId(), 'scene:active-scene');
        globalThis.game.scenes = { current: { id: 'scene-abc' }, active: { id: 'scene-abc' } };
    });

    test('returns "scene:none" as fallback when no scene is available', () => {
        globalThis.game.combat = null;
        globalThis.game.scenes = { current: null, active: null };
        assert.equal(getSlaEncounterScopeId(), 'scene:none');
        globalThis.game.scenes = { current: { id: 'scene-abc' }, active: { id: 'scene-abc' } };
    });
});

// ─── isToxicantImmuneThisEncounter ───────────────────────────────────────────

describe('isToxicantImmuneThisEncounter', () => {
    function makeActor(flagMap) {
        return {
            getFlag: (scope, key) => (scope === 'sla-industries' && key === 'toxicantImmunity' ? flagMap : null)
        };
    }

    test('returns false when actor has no immunity flags at all', () => {
        globalThis.game.combat = null;
        assert.equal(isToxicantImmuneThisEncounter(makeActor(null), 'item-1'), false);
    });

    test('returns false when flag map is not an object', () => {
        globalThis.game.combat = null;
        assert.equal(isToxicantImmuneThisEncounter(makeActor('bad'), 'item-1'), false);
    });

    test('returns false when item uuid is not in the immunity map', () => {
        globalThis.game.combat = null;
        assert.equal(isToxicantImmuneThisEncounter(makeActor({}), 'item-1'), false);
    });

    test('returns true when scope matches current scene scope', () => {
        globalThis.game.combat = null;
        globalThis.game.scenes = { current: { id: 'scene-abc' }, active: { id: 'scene-abc' } };
        const actor = makeActor({ 'item-uuid-1': 'scene:scene-abc' });
        assert.equal(isToxicantImmuneThisEncounter(actor, 'item-uuid-1'), true);
    });

    test('returns false when stored scope is from a different scene', () => {
        globalThis.game.combat = null;
        globalThis.game.scenes = { current: { id: 'scene-abc' }, active: { id: 'scene-abc' } };
        const actor = makeActor({ 'item-uuid-1': 'scene:other-scene' });
        assert.equal(isToxicantImmuneThisEncounter(actor, 'item-uuid-1'), false);
    });

    test('returns true when scope matches active combat', () => {
        globalThis.game.combat = { started: true, id: 'combat-42' };
        const actor = makeActor({ 'item-uuid-2': 'combat:combat-42' });
        assert.equal(isToxicantImmuneThisEncounter(actor, 'item-uuid-2'), true);
    });

    test('returns false when combat id differs from stored scope', () => {
        globalThis.game.combat = { started: true, id: 'combat-42' };
        const actor = makeActor({ 'item-uuid-2': 'combat:combat-99' });
        assert.equal(isToxicantImmuneThisEncounter(actor, 'item-uuid-2'), false);
    });

    test('immunity from a previous scene does not carry over to a new scene', () => {
        globalThis.game.combat = null;
        globalThis.game.scenes = { current: { id: 'scene-new' }, active: { id: 'scene-new' } };
        // Flag was set during 'scene-old'
        const actor = makeActor({ 'item-uuid-3': 'scene:scene-old' });
        assert.equal(isToxicantImmuneThisEncounter(actor, 'item-uuid-3'), false);
    });
});
