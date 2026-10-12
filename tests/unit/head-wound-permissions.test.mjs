/**
 * Issue #418: head-wound side effects must respect document permissions.
 */
import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('SlaActor#_onUpdate (source contract)', () => {
    test('returns early on clients that did not make the update, before any write', () => {
        const src = readFileSync(join(root, 'module/documents/actor.mjs'), 'utf8');
        const body = src.slice(src.indexOf('async _onUpdate('));
        const guard = body.indexOf('if (game.user.id !== userId) return;');
        assert.ok(guard > 0, 'guard missing');
        assert.ok(guard < body.indexOf('this.update('), 'guard must precede the HP clamp write');
        assert.ok(guard < body.indexOf('handleWoundEffects('), 'guard must precede wound effects');
    });
});

describe('system.json', () => {
    test('enables system sockets for the head-wound relay', () => {
        const manifest = JSON.parse(readFileSync(join(root, 'system.json'), 'utf8'));
        assert.equal(manifest.socket, true);
    });
});

describe('applyHeadshotSideEffect', () => {
    let applyHeadshotSideEffect;
    let emitted;
    let handlers;

    const setGame = ({ canModify, activeGM = { id: 'gm' } }) => {
        const actor = {
            uuid: 'Actor.target',
            system: { wounds: { head: false } },
            updates: [],
            canUserModify: () => canModify,
            async update(data) {
                this.updates.push(data);
            }
        };
        globalThis.game = {
            user: { targets: { size: 1, first: () => ({ actor }) } },
            users: { activeGM },
            socket: {
                emit: (event, data) => emitted.push([event, data]),
                on: (event, fn) => handlers.set(event, fn)
            }
        };
        return actor;
    };

    beforeEach(async () => {
        emitted = [];
        handlers = new Map();
        globalThis.Hooks = { once: () => {} };
        ({ applyHeadshotSideEffect } = await import('../../module/sheets/actor/sheet-helpers.mjs'));
    });

    afterEach(() => {
        delete globalThis.game;
        delete globalThis.Hooks;
    });

    test('writes directly when the user can modify the target', async () => {
        const actor = setGame({ canModify: true });
        const notes = [];
        await applyHeadshotSideEffect(notes);
        assert.deepEqual(actor.updates, [{ 'system.wounds.head': true }]);
        assert.equal(emitted.length, 0);
        assert.equal(notes.length, 1);
    });

    test('relays only the action and actor uuid to the GM when the user cannot modify the target', async () => {
        const actor = setGame({ canModify: false });
        const notes = [];
        await applyHeadshotSideEffect(notes);
        assert.equal(actor.updates.length, 0);
        assert.deepEqual(emitted, [['system.sla-industries', { action: 'applyHeadWound', actorUuid: 'Actor.target' }]]);
        assert.equal(notes.length, 1);
    });

    test('reports and does not write or emit when no GM is online', async () => {
        const actor = setGame({ canModify: false, activeGM: null });
        const notes = [];
        await applyHeadshotSideEffect(notes);
        assert.equal(actor.updates.length, 0);
        assert.equal(emitted.length, 0);
        assert.match(notes[0], /no GM is online/);
    });
});
