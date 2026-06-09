/**
 * Unit tests for Ebb critical flux sync logic (mocked Foundry I/O).
 *
 * Spec: EBB_SYSTEM.md §Critical FLUX
 * When a formula roll succeeds with 4+ skill successes → actor regains 1 FLUX (capped at max).
 * If the TN changes or Luck alters the roll, flux is granted or revoked to stay consistent.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

// Stub game / ui globals — accessed inside function bodies only
globalThis.game = {
    user: { isGM: true },
    i18n: { format: (_key, _data) => '' }
};
globalThis.ui = { notifications: { info: () => {} } };

import { syncEbbCriticalFlux } from '../../module/helpers/ebb-flux.mjs';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeActor({ fluxValue = 3, fluxMax = 6, canModify = true } = {}) {
    const updates = [];
    const actor = {
        name: 'Test Operative',
        system: { stats: { flux: { value: fluxValue, max: fluxMax } } },
        testUserPermission: () => canModify,
        update: async (data) => {
            // Simulate Foundry update: reflect the change for subsequent reads
            if (data['system.stats.flux.value'] !== undefined) {
                actor.system.stats.flux.value = data['system.stats.flux.value'];
            }
            updates.push(data);
        }
    };
    return { actor, updates };
}

function makeMessage({ ebbFluxRegainApplied = false } = {}) {
    const updates = [];
    const msg = {
        flags: { sla: { isEbb: true, ebbFluxRegainApplied } },
        update: async (data) => {
            updates.push(data);
        }
    };
    return { msg, updates };
}

// ─── Early-exit guard conditions ──────────────────────────────────────────────

describe('syncEbbCriticalFlux — early-exit guards', () => {
    test('does nothing when flags.isEbb is false', async () => {
        const { actor, updates } = makeActor();
        const { msg } = makeMessage();
        msg.flags.sla.isEbb = false;
        await syncEbbCriticalFlux(msg, actor, msg.flags.sla, true, 4);
        assert.equal(updates.length, 0);
    });

    test('does nothing when message is null', async () => {
        const { actor, updates } = makeActor();
        await syncEbbCriticalFlux(null, actor, { isEbb: true }, true, 4);
        assert.equal(updates.length, 0);
    });

    test('does nothing when actor is null', async () => {
        const { msg, updates } = makeMessage();
        await syncEbbCriticalFlux(msg, null, msg.flags.sla, true, 4);
        assert.equal(updates.length, 0);
    });

    test('does nothing when shouldHave already matches applied state (no change needed)', async () => {
        // shouldHave = true (success, 4 hits), applied = true — already in sync
        const { actor, updates: actorUpdates } = makeActor();
        const { msg, updates: msgUpdates } = makeMessage({ ebbFluxRegainApplied: true });
        await syncEbbCriticalFlux(msg, actor, msg.flags.sla, true, 4);
        assert.equal(actorUpdates.length, 0);
        assert.equal(msgUpdates.length, 0);
    });

    test('does nothing when actor owner lacks modify permission', async () => {
        const { actor, updates } = makeActor({ canModify: false });
        const { msg } = makeMessage();
        globalThis.game.user.isGM = false;
        await syncEbbCriticalFlux(msg, actor, msg.flags.sla, true, 4);
        assert.equal(updates.length, 0);
        globalThis.game.user.isGM = true;
    });
});

// ─── Flux regain (shouldHave = true, applied = false) ─────────────────────────

describe('syncEbbCriticalFlux — flux regain on critical success', () => {
    test('adds 1 flux when success with 4+ skill successes', async () => {
        const { actor, updates } = makeActor({ fluxValue: 3, fluxMax: 6 });
        const { msg, updates: msgUpdates } = makeMessage({ ebbFluxRegainApplied: false });
        await syncEbbCriticalFlux(msg, actor, msg.flags.sla, true, 4);
        assert.equal(updates[0]['system.stats.flux.value'], 4);
        assert.equal(msgUpdates[0]['flags.sla.ebbFluxRegainApplied'], true);
    });

    test('caps flux regain at max — does not exceed flux.max', async () => {
        const { actor, updates } = makeActor({ fluxValue: 6, fluxMax: 6 });
        const { msg } = makeMessage({ ebbFluxRegainApplied: false });
        await syncEbbCriticalFlux(msg, actor, msg.flags.sla, true, 4);
        // next = Math.min(6, 6+1) = 6, but still updates the flag
        assert.equal(updates[0]['system.stats.flux.value'], 6);
    });

    test('requires exactly 4+ skill successes (3 is not enough)', async () => {
        const { actor, updates } = makeActor({ fluxValue: 3, fluxMax: 6 });
        const { msg, updates: msgUpdates } = makeMessage({ ebbFluxRegainApplied: false });
        await syncEbbCriticalFlux(msg, actor, msg.flags.sla, true, 3);
        // shouldHave = false (only 3 hits), applied = false — already in sync → no-op
        assert.equal(updates.length, 0);
        assert.equal(msgUpdates.length, 0);
    });

    test('requires a successful roll — 4 skill hits on a failed roll does not grant flux', async () => {
        const { actor, updates } = makeActor({ fluxValue: 3, fluxMax: 6 });
        const { msg, updates: msgUpdates } = makeMessage({ ebbFluxRegainApplied: false });
        // Success Through Experience gives a hit but not a critical flux
        await syncEbbCriticalFlux(msg, actor, msg.flags.sla, false, 4);
        assert.equal(updates.length, 0);
        assert.equal(msgUpdates.length, 0);
    });

    test('5+ skill successes also triggers flux regain', async () => {
        const { actor, updates } = makeActor({ fluxValue: 2, fluxMax: 6 });
        const { msg } = makeMessage({ ebbFluxRegainApplied: false });
        await syncEbbCriticalFlux(msg, actor, msg.flags.sla, true, 5);
        assert.equal(updates[0]['system.stats.flux.value'], 3);
    });
});

// ─── Flux revocation (shouldHave = false, applied = true) ────────────────────

describe('syncEbbCriticalFlux — flux revoke when result is downgraded', () => {
    test('removes 1 flux when roll is downgraded below critical threshold', async () => {
        // GM adjusts TN upward so roll no longer succeeds → revoke the earlier flux grant
        const { actor, updates } = makeActor({ fluxValue: 4, fluxMax: 6 });
        const { msg, updates: msgUpdates } = makeMessage({ ebbFluxRegainApplied: true });
        await syncEbbCriticalFlux(msg, actor, msg.flags.sla, false, 4);
        assert.equal(updates[0]['system.stats.flux.value'], 3);
        assert.equal(msgUpdates[0]['flags.sla.ebbFluxRegainApplied'], false);
    });

    test('flux revoke is floored at 0', async () => {
        const { actor, updates } = makeActor({ fluxValue: 0, fluxMax: 6 });
        const { msg } = makeMessage({ ebbFluxRegainApplied: true });
        await syncEbbCriticalFlux(msg, actor, msg.flags.sla, false, 2);
        assert.equal(updates[0]['system.stats.flux.value'], 0); // Math.max(0, 0-1)
    });

    test('flux revoke when skill success count drops below 4', async () => {
        const { actor, updates } = makeActor({ fluxValue: 5, fluxMax: 6 });
        const { msg } = makeMessage({ ebbFluxRegainApplied: true });
        await syncEbbCriticalFlux(msg, actor, msg.flags.sla, true, 3);
        assert.equal(updates[0]['system.stats.flux.value'], 4);
    });
});
