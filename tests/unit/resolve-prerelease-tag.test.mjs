import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTag } from '../../scripts/resolve-prerelease-tag.mjs';

test('resolves plain pre-release tag', () => {
    const r = resolveTag('pre-2.9.0');
    assert.equal(r.tagName, 'pre-2.9.0');
    assert.equal(r.version, '2.9.0');
    assert.equal(r.baseVersion, '2.9.0');
});

test('resolves v-prefixed pre-release tag', () => {
    const r = resolveTag('pre-v2.9.0');
    assert.equal(r.tagName, 'pre-v2.9.0');
    assert.equal(r.version, '2.9.0');
    assert.equal(r.baseVersion, '2.9.0');
});

test('resolves rc1 tag', () => {
    const r = resolveTag('pre-2.9.0-rc1');
    assert.equal(r.tagName, 'pre-2.9.0-rc1');
    assert.equal(r.version, '2.9.0-rc1');
    assert.equal(r.baseVersion, '2.9.0');
});

test('resolves rc2 tag', () => {
    const r = resolveTag('pre-2.9.0-rc2');
    assert.equal(r.tagName, 'pre-2.9.0-rc2');
    assert.equal(r.version, '2.9.0-rc2');
    assert.equal(r.baseVersion, '2.9.0');
});

test('resolves v-prefixed rc tag', () => {
    const r = resolveTag('pre-v2.9.0-rc3');
    assert.equal(r.tagName, 'pre-v2.9.0-rc3');
    assert.equal(r.version, '2.9.0-rc3');
    assert.equal(r.baseVersion, '2.9.0');
});

test('resolves double-digit rc number', () => {
    const r = resolveTag('pre-3.0.0-rc10');
    assert.equal(r.version, '3.0.0-rc10');
    assert.equal(r.baseVersion, '3.0.0');
});
