/**
 * Unit tests for resolveEbbFormulaVictim's target-vs-selected precedence, used by both the
 * "Apply to Target"/"Apply to Selected" damage-result buttons and the Ebb formula flow.
 *
 * Regression: "Apply to Selected" must resolve the currently-controlled token even when the
 * originating roll already recorded a target (flags.sla.targets) — otherwise it always applies
 * to that recorded target instead, making the two buttons indistinguishable.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

class Actor {}

globalThis.game = {
    user: { targets: { first: () => null } },
    i18n: { localize: (key) => key }
};
globalThis.ui = { notifications: { warn: () => {} } };
globalThis.canvas = { tokens: { controlled: [] } };
globalThis.Actor = Actor;
globalThis.fromUuid = async (uuid) => globalThis.__mockDocsByUuid?.[uuid] ?? null;

import { resolveEbbFormulaVictim } from '../../module/helpers/chat/damage.mjs';

function makeActor(name) {
    const actor = new Actor();
    actor.name = name;
    return actor;
}

describe('resolveEbbFormulaVictim target/selected precedence', () => {
    test('"Apply to Target" resolves the roll\'s recorded target', async () => {
        const targetActor = makeActor('Recorded Target');
        globalThis.__mockDocsByUuid = { 'Actor.target-1': targetActor };
        globalThis.canvas.tokens.controlled = [{ actor: makeActor('Controlled Token') }];

        const victim = await resolveEbbFormulaVictim(null, 'enemy', {
            type: 'target',
            targetUuid: null,
            parentTargets: ['Actor.target-1']
        });

        assert.equal(victim, targetActor);
    });

    test('"Apply to Selected" resolves the controlled token, not the recorded target', async () => {
        const targetActor = makeActor('Recorded Target');
        const selectedActor = makeActor('Controlled Token');
        globalThis.__mockDocsByUuid = { 'Actor.target-1': targetActor };
        globalThis.canvas.tokens.controlled = [{ actor: selectedActor }];

        const victim = await resolveEbbFormulaVictim(null, 'enemy', {
            type: 'selected',
            targetUuid: null,
            parentTargets: ['Actor.target-1']
        });

        assert.equal(victim, selectedActor);
        assert.notEqual(victim, targetActor);
    });

    test('"Apply to Selected" warns and returns null when no token is controlled', async () => {
        globalThis.__mockDocsByUuid = { 'Actor.target-1': makeActor('Recorded Target') };
        globalThis.canvas.tokens.controlled = [];
        let warned = false;
        globalThis.ui.notifications.warn = () => {
            warned = true;
        };

        const victim = await resolveEbbFormulaVictim(null, 'enemy', {
            type: 'selected',
            targetUuid: null,
            parentTargets: ['Actor.target-1']
        });

        assert.equal(victim, null);
        assert.equal(warned, true);
        globalThis.ui.notifications.warn = () => {};
    });

    test('an explicit target-uuid still short-circuits both target and selected', async () => {
        const explicitActor = makeActor('Explicit UUID Target');
        globalThis.__mockDocsByUuid = {
            'Actor.target-1': makeActor('Recorded Target'),
            'Actor.explicit-1': explicitActor
        };
        globalThis.canvas.tokens.controlled = [{ actor: makeActor('Controlled Token') }];

        const victim = await resolveEbbFormulaVictim(null, 'enemy', {
            type: 'selected',
            targetUuid: 'Actor.explicit-1',
            parentTargets: ['Actor.target-1']
        });

        assert.equal(victim, explicitActor);
    });
});
