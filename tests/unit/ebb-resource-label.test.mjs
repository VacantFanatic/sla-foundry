/**
 * Unit tests for the Ebb resource display-label resolver.
 *
 * Certain NPCs/Threats use Ebb-style powers under a fluff name other than "FLUX" (e.g. Shi'an
 * "Flow"). `system.ebb.resourceLabel` lets a GM set that per-actor; blank/unset falls back to the
 * default "FLUX" so existing PCs and un-configured NPCs are unaffected.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveEbbResourceLabel } from '../../module/helpers/ebb-resource-label.mjs';

describe('resolveEbbResourceLabel', () => {
    test('falls back to FLUX when system.ebb is missing entirely', () => {
        assert.equal(resolveEbbResourceLabel({}), 'FLUX');
    });

    test('falls back to FLUX when resourceLabel is unset', () => {
        assert.equal(resolveEbbResourceLabel({ ebb: {} }), 'FLUX');
    });

    test('falls back to FLUX when resourceLabel is an empty string', () => {
        assert.equal(resolveEbbResourceLabel({ ebb: { resourceLabel: '' } }), 'FLUX');
    });

    test('falls back to FLUX when resourceLabel is only whitespace', () => {
        assert.equal(resolveEbbResourceLabel({ ebb: { resourceLabel: '   ' } }), 'FLUX');
    });

    test('uses the custom label as-authored, preserving case', () => {
        assert.equal(resolveEbbResourceLabel({ ebb: { resourceLabel: 'Flow' } }), 'Flow');
    });

    test('trims surrounding whitespace from a custom label', () => {
        assert.equal(resolveEbbResourceLabel({ ebb: { resourceLabel: '  Flow  ' } }), 'Flow');
    });

    test('handles a null system gracefully', () => {
        assert.equal(resolveEbbResourceLabel(null), 'FLUX');
        assert.equal(resolveEbbResourceLabel(undefined), 'FLUX');
    });
});
