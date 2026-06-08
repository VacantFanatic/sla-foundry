/**
 * Unit tests for chat DOM helpers (no Foundry runtime).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { handlerEvent, readDataNumber, readDataString } from '../../module/helpers/chat/dom.mjs';

describe('handlerEvent', () => {
    test('exposes preventDefault and stopPropagation from the native event', () => {
        let prevented = false;
        let stopped = false;
        const nativeEv = {
            preventDefault: () => {
                prevented = true;
            },
            stopPropagation: () => {
                stopped = true;
            }
        };
        const target = { tagName: 'BUTTON' };
        const handlerEv = handlerEvent(nativeEv, target);

        assert.equal(handlerEv.currentTarget, target);
        handlerEv.preventDefault();
        handlerEv.stopPropagation();
        assert.equal(prevented, true);
        assert.equal(stopped, true);
    });

    test('spread native Event does not provide preventDefault (regression guard)', () => {
        const nativeEv = new Event('click');
        const broken = { ...nativeEv, currentTarget: {} };
        assert.equal(typeof broken.preventDefault, 'undefined');
        assert.equal(typeof handlerEvent(nativeEv, {}).preventDefault, 'function');
    });
});

describe('readDataString / readDataNumber', () => {
    test('reads data-tn from diff buttons', () => {
        const btn = {
            dataset: { tn: '13' },
            getAttribute: (name) => (name === 'data-tn' ? '13' : null)
        };
        assert.equal(readDataString(btn, 'tn'), '13');
        assert.equal(readDataNumber(btn, 'tn', 10), 13);
    });
});
