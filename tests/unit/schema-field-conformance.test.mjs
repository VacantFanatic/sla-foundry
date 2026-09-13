/**
 * Guards against the "data injection" bug class documented in CLAUDE.md's Lessons
 * learned: code reading `item.system.<field>` where the field was never declared in
 * `defineSchema()`, so Foundry's TypeDataModel silently drops it and nothing persists.
 *
 * The Reload -> ammo-modifier pipeline (module/sheets/actor/reload-pure.mjs producing
 * `system.ammoType`, module/sheets/actor/weapon-gates-pure.mjs consuming it) is tested
 * on both sides only with hand-built mock objects, so a future rename of these field
 * names would pass every existing unit test while silently breaking the real feature.
 * This test ties those field names back to the actual schema source, independent of
 * any Foundry runtime (source-text checks only, matching tests/unit/document-classes.test.mjs).
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

describe('SlaWeaponData schema — Reload/ammo-modifier field contract', () => {
    const body = extractClassBody(itemDataSrc, 'SlaWeaponData');

    test('declares ammoType (read by weapon-gates-pure.mjs, written by reload-pure.mjs)', () => {
        assert.match(body, /ammoType:\s*new fields\.StringField/);
    });

    test('does not redeclare the undeclared fields from the original magazineId bug', () => {
        assert.doesNotMatch(body, /\bmagazineId\s*:/);
        assert.doesNotMatch(body, /\battackDice\s*:/);
    });
});

describe('SlaWeaponData/SlaEbbFormulaData schema — drop-zone fields start empty', () => {
    // Regression guard: these two fields are rendered as drag-and-drop link zones
    // (.docs/item_setup.md — "Required Skill", "Required Discipline"), so a non-empty
    // `initial` silently pre-links every new item to the wrong skill/discipline unless
    // a GM notices and clears it. SlaMagazineData.linkedWeapon and SlaEbbFormulaData's
    // own `skill` field are the same kind of drop zone and correctly declare no initial.
    const weaponBody = extractClassBody(itemDataSrc, 'SlaWeaponData');
    const ebbFormulaBody = extractClassBody(itemDataSrc, 'SlaEbbFormulaData');

    test('SlaWeaponData.skill has no pre-filled initial value', () => {
        assert.match(weaponBody, /skill:\s*new fields\.StringField\(\)/);
        assert.doesNotMatch(weaponBody, /skill:\s*new fields\.StringField\(\s*\{\s*initial:/);
    });

    test('SlaEbbFormulaData.discipline has no pre-filled initial value', () => {
        assert.match(ebbFormulaBody, /discipline:\s*new fields\.StringField\(\)/);
        assert.doesNotMatch(ebbFormulaBody, /discipline:\s*new fields\.StringField\(\s*\{\s*initial:/);
    });
});

describe('SlaMagazineData schema — Reload producer field contract', () => {
    const body = extractClassBody(itemDataSrc, 'SlaMagazineData');

    test('declares the fields buildReloadWeaponUpdate() reads off a magazine', () => {
        assert.match(body, /ammoType:\s*new fields\.StringField/);
        assert.match(body, /ammoCapacity:\s*new fields\.NumberField/);
    });

    test('declares linkedWeapon and quantity used by onReloadWeapon()/performReload()', () => {
        assert.match(body, /linkedWeapon:\s*new fields\.StringField/);
        assert.match(body, /quantity:\s*new fields\.NumberField/);
    });
});
