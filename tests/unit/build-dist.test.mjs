import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertVersionSync, loadManifest, validateDist, validateZip } from '../../scripts/validate-dist.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const distDir = path.join(root, 'dist');
const zipPath = path.join(root, 'sla-industries.zip');

describe('release packaging', () => {
    before(() => {
        execSync('npm run build', { cwd: root, stdio: 'pipe' });
    });

    test('package.json and system.json versions match', () => {
        assert.doesNotThrow(() => assertVersionSync(root));
    });

    test('dist contains every manifest path', () => {
        const manifest = loadManifest(root);
        const result = validateDist(distDir, manifest);
        assert.equal(result.ok, true);
        assert.ok(result.pathCount >= 10);
    });

    test('npm run package produces a valid zip layout', () => {
        execSync('npm run package', { cwd: root, stdio: 'pipe' });
        assert.ok(fs.existsSync(zipPath));
        const result = validateZip(zipPath);
        assert.equal(result.ok, true);
        assert.ok(result.entryCount > 20);
    });
});
