/**
 * Regression guard for SlaBlueprintNewsData's field types (source-text check, no Foundry
 * runtime available — matches the pattern in tests/unit/schema-field-conformance.test.mjs).
 * Catches accidental field-type drift, e.g. a colourCode tier silently dropped from
 * `choices`, or a reward field switched to a NumberField that can't hold values like
 * "1000c upwards" or "[D-NOTICE]".
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const itemDataSrc = readFileSync(join(root, 'module/data/item.mjs'), 'utf8');

/**
 * @param {string} src
 * @param {string} className
 * @returns {string}
 */
function extractClassBody(src, className) {
    const start = src.indexOf(`export class ${className} extends foundry.abstract.TypeDataModel`);
    assert.notEqual(start, -1, `expected to find class ${className} in module/data/item.mjs`);
    const nextClass = src.indexOf('\nexport class ', start + 1);
    return nextClass === -1 ? src.slice(start) : src.slice(start, nextClass);
}

describe('SlaBlueprintNewsData schema', () => {
    const body = extractClassBody(itemDataSrc, 'SlaBlueprintNewsData');

    test('declares authorisation and trainingPackage as StringField', () => {
        assert.match(body, /authorisation:\s*new fields\.StringField/);
        assert.match(body, /trainingPackage:\s*new fields\.StringField/);
    });

    test('colourCode is a StringField with all 11 rulebook tiers as choices', () => {
        assert.match(body, /colourCode:\s*new fields\.StringField/);
        for (const tier of [
            'blue',
            'white',
            'yellow',
            'green',
            'red',
            'grey',
            'jade',
            'orange',
            'black',
            'silver',
            'platinum'
        ]) {
            assert.match(body, new RegExp(`${tier}:\\s*'SLA\\.ItemSheet\\.BlueprintNews\\.Colour\\.`, 'i'));
        }
    });

    test('stationAnalysis and thirdEyeNews are BooleanField', () => {
        assert.match(body, /stationAnalysis:\s*new fields\.BooleanField/);
        assert.match(body, /thirdEyeNews:\s*new fields\.BooleanField/);
    });

    test('creditsReward and sclIncrease are free-text StringField (ranges like "0.5 upwards" or "[D-NOTICE]" are not numeric)', () => {
        assert.match(body, /creditsReward:\s*new fields\.StringField/);
        assert.match(body, /sclIncrease:\s*new fields\.StringField/);
    });

    test('rating is a NumberField', () => {
        assert.match(body, /rating:\s*new fields\.NumberField/);
    });

    test('declares description as HTMLField (shared Description tab)', () => {
        assert.match(body, /description:\s*new fields\.HTMLField/);
    });
});
