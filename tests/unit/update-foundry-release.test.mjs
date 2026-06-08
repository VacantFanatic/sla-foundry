import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildFoundryReleasePayload } from '../../scripts/update-foundry-release.mjs';

const manifest = {
    id: 'sla-industries',
    version: '2.5.4',
    compatibility: {
        minimum: '14',
        verified: '14.360'
    }
};

const releaseEvent = {
    repository: {
        full_name: 'VacantFanatic/sla-foundry'
    },
    release: {
        tag_name: '2.5.4',
        html_url: 'https://github.com/VacantFanatic/sla-foundry/releases/tag/2.5.4',
        assets: [
            {
                name: 'system.json',
                browser_download_url: 'https://github.com/VacantFanatic/sla-foundry/releases/download/2.5.4/system.json'
            }
        ]
    }
};

describe('Foundry release updater', () => {
    it('uses the manifest package id and published release asset URL', () => {
        const payload = buildFoundryReleasePayload(manifest, releaseEvent);

        assert.deepEqual(payload, {
            id: 'sla-industries',
            'dry-run': false,
            release: {
                version: '2.5.4',
                manifest: 'https://github.com/VacantFanatic/sla-foundry/releases/download/2.5.4/system.json',
                notes: 'https://github.com/VacantFanatic/sla-foundry/releases/tag/2.5.4',
                compatibility: {
                    minimum: '14',
                    verified: '14.360',
                    maximum: undefined
                }
            }
        });
    });

    it('falls back to a versioned release URL without adding a v prefix', () => {
        const payload = buildFoundryReleasePayload(manifest, {
            ...releaseEvent,
            release: {
                tag_name: '2.5.4',
                html_url: 'https://github.com/VacantFanatic/sla-foundry/releases/tag/2.5.4',
                assets: []
            }
        });

        assert.equal(
            payload.release.manifest,
            'https://github.com/VacantFanatic/sla-foundry/releases/download/2.5.4/system.json'
        );
    });

    it('honors dry-run mode', () => {
        const payload = buildFoundryReleasePayload(manifest, releaseEvent, { dryRun: true });

        assert.equal(payload['dry-run'], true);
    });
});
