import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSpeciesRemovalUpdates } from '../../module/sheets/actor/sheet-actions-pure.mjs';

describe('buildSpeciesRemovalUpdates', () => {
    test('clears species bio and resets core stats to 1', () => {
        const updates = buildSpeciesRemovalUpdates();
        assert.equal(updates['system.bio.species'], '');
        assert.equal(updates['system.stats.str.value'], 1);
        assert.equal(updates['system.stats.cool.value'], 1);
    });
});
