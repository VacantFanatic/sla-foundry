/**
 * Document class rename contracts (static source checks; no Foundry runtime).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('SlaActor document class', () => {
    test('exports SlaActor with BoilerplateActor alias in actor.mjs', () => {
        const src = readFileSync(join(root, 'module/documents/actor.mjs'), 'utf8');
        assert.match(src, /export class SlaActor extends Actor/);
        assert.match(src, /export const BoilerplateActor = SlaActor/);
    });
});

describe('SlaItem document class', () => {
    test('exports SlaItem with BoilerplateItem alias in item.mjs', () => {
        const src = readFileSync(join(root, 'module/documents/item.mjs'), 'utf8');
        assert.match(src, /export class SlaItem extends Item/);
        assert.match(src, /export const BoilerplateItem = SlaItem/);
    });
});

describe('sla-industries init registration', () => {
    test('registers SlaActor/SlaItem on CONFIG and game APIs', () => {
        const src = readFileSync(join(root, 'module/sla-industries.mjs'), 'utf8');
        assert.match(src, /CONFIG\.Actor\.documentClass = SlaActor/);
        assert.match(src, /CONFIG\.Item\.documentClass = SlaItem/);
        assert.match(src, /SlaActor,\s*\n\s*SlaItem/);
        assert.match(src, /BoilerplateActor,\s*\n\s*BoilerplateItem/);
    });
});
