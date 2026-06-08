/**
 * Ensures system.json documentTypes match registered data model type keys.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ACTOR_DATA_MODEL_TYPE_KEYS, ITEM_DATA_MODEL_TYPE_KEYS } from '../../module/data/model-type-keys.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const systemPath = join(__dirname, '../../system.json');

/**
 * @param {string[]} actual
 * @param {readonly string[]} expected
 * @param {string} label
 */
function assertSameKeys(actual, expected, label) {
    assert.deepEqual([...actual].sort(), [...expected].sort(), `${label} keys must match model-type-keys.mjs`);
}

describe('data model registry keys', () => {
    test('match system.json documentTypes for Actor and Item', () => {
        const system = JSON.parse(readFileSync(systemPath, 'utf8'));
        const actorTypes = Object.keys(system.documentTypes.Actor);
        const itemTypes = Object.keys(system.documentTypes.Item);

        assertSameKeys(actorTypes, ACTOR_DATA_MODEL_TYPE_KEYS, 'Actor');
        assertSameKeys(itemTypes, ITEM_DATA_MODEL_TYPE_KEYS, 'Item');
    });
});
