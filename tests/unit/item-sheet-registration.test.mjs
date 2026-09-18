/**
 * Item sheet subclass registration contracts (static source checks; no Foundry runtime).
 *
 * SlaItemSheet dispatches per-type context via static useTwoTabs/useCataloguePart on each
 * registered subclass (see module/sheets/item-sheet.mjs) rather than branching internally, so a
 * copy-paste error in either the registration call or a subclass's statics would silently fall a
 * document type back to the wrong tab layout. This asserts every item type is registered with its
 * own subclass and that each subclass declares both statics with the expected values.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const industriesSrc = readFileSync(join(root, 'module/sla-industries.mjs'), 'utf8');

/** type -> { file, className, useTwoTabs, useCataloguePart } */
const EXPECTED = {
    item: { file: 'item-gear-sheet.mjs', className: 'SlaGearItemSheet', useTwoTabs: false, useCataloguePart: true },
    skill: { file: 'item-skill-sheet.mjs', className: 'SlaSkillItemSheet', useTwoTabs: true, useCataloguePart: false },
    trait: { file: 'item-trait-sheet.mjs', className: 'SlaTraitItemSheet', useTwoTabs: false, useCataloguePart: false },
    weapon: {
        file: 'item-weapon-sheet.mjs',
        className: 'SlaWeaponItemSheet',
        useTwoTabs: true,
        useCataloguePart: true
    },
    explosive: {
        file: 'item-explosive-sheet.mjs',
        className: 'SlaExplosiveItemSheet',
        useTwoTabs: true,
        useCataloguePart: true
    },
    armor: { file: 'item-armor-sheet.mjs', className: 'SlaArmorItemSheet', useTwoTabs: true, useCataloguePart: true },
    ebbFormula: {
        file: 'item-ebb-formula-sheet.mjs',
        className: 'SlaEbbFormulaItemSheet',
        useTwoTabs: false,
        useCataloguePart: false
    },
    discipline: {
        file: 'item-discipline-sheet.mjs',
        className: 'SlaDisciplineItemSheet',
        useTwoTabs: true,
        useCataloguePart: false
    },
    drug: { file: 'item-drug-sheet.mjs', className: 'SlaDrugItemSheet', useTwoTabs: false, useCataloguePart: true },
    toxicant: {
        file: 'item-toxicant-sheet.mjs',
        className: 'SlaToxicantItemSheet',
        useTwoTabs: false,
        useCataloguePart: true
    },
    species: {
        file: 'item-species-sheet.mjs',
        className: 'SlaSpeciesItemSheet',
        useTwoTabs: true,
        useCataloguePart: false
    },
    package: {
        file: 'item-package-sheet.mjs',
        className: 'SlaPackageItemSheet',
        useTwoTabs: true,
        useCataloguePart: false
    },
    magazine: {
        file: 'item-magazine-sheet.mjs',
        className: 'SlaMagazineItemSheet',
        useTwoTabs: true,
        useCataloguePart: true
    }
};

describe('item sheet subclass registration', () => {
    for (const [type, { file, className, useTwoTabs, useCataloguePart }] of Object.entries(EXPECTED)) {
        test(`${type} is registered with ${className} and types: ['${type}']`, () => {
            const registerRe = new RegExp(
                `Items\\.registerSheet\\('sla-industries',\\s*${className},\\s*\\{[^}]*types:\\s*\\['${type}'\\]`,
                's'
            );
            assert.match(industriesSrc, registerRe, `expected ${className} registered for type '${type}'`);
        });

        test(`${className} declares useTwoTabs=${useTwoTabs} and useCataloguePart=${useCataloguePart}`, () => {
            const src = readFileSync(join(root, 'module/sheets/item', file), 'utf8');
            assert.match(src, new RegExp(`class ${className} extends SlaItemSheet`));
            assert.match(src, new RegExp(`static useTwoTabs = ${useTwoTabs};`));
            assert.match(src, new RegExp(`static useCataloguePart = ${useCataloguePart};`));
        });
    }

    test('every ITEM_DATA_MODELS type key has a corresponding subclass registration', () => {
        const registrySrc = readFileSync(join(root, 'module/data/registry.mjs'), 'utf8');
        const match = registrySrc.match(/export const ITEM_DATA_MODELS = \{([^}]*)\}/s);
        assert.ok(match, 'could not find ITEM_DATA_MODELS in registry.mjs');
        const keys = [...match[1].matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);
        assert.deepEqual(keys.sort(), Object.keys(EXPECTED).sort());
    });
});
