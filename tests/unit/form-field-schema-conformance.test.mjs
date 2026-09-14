/**
 * Generic regression guard for the bug class behind issue #348: a template `name="system.xxx"`
 * (or `{{checked system.xxx}}`) binding whose path doesn't match any field actually declared in
 * `defineSchema()` fails silently — `TypeDataModel` drops unknown submitted keys, so the input
 * just never persists and no error is ever raised (see .docs/LESSONS_LEARNED.md).
 *
 * Issue #348 was exactly this: templates/actor/parts/header-card.hbs bound the LAD checkbox to
 * `system.bio.lad`, but `SlaCharacterData` only declares `bio.ladAccount`. Rather than a one-off
 * test for that one field, this scans every `.hbs` template under templates/ for static
 * `name="system...."` bindings and checks each dotted path against the real actor/item schemas in
 * module/data/actor.mjs and module/data/item.mjs, parsed as source text (like
 * tests/unit/schema-field-conformance.test.mjs and tests/unit/document-classes.test.mjs) — there is
 * no Foundry runtime available here, and these files reference `foundry.abstract.TypeDataModel` /
 * `foundry.data.fields` at import time with no global mock in tests/, so they can't be imported and
 * executed directly.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, sep } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

const OPAQUE_FIELD_TYPES = new Set(['ArrayField', 'ObjectField', 'TypedObjectField']);

const ACTOR_CLASS_NAMES = ['SlaCharacterData', 'SlaNPCData', 'SlaVehicleData'];
const ITEM_CLASS_NAMES = [
    'SlaItemData',
    'SlaSkillData',
    'SlaTraitData',
    'SlaWeaponData',
    'SlaExplosiveData',
    'SlaArmorData',
    'SlaEbbFormulaData',
    'SlaDisciplineData',
    'SlaDrugData',
    'SlaToxicantData',
    'SlaSpeciesData',
    'SlaPackageData',
    'SlaMagazineData'
];

/** @param {string} src */
function stripJsComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/** @param {string} src */
function stripHandlebarsComments(src) {
    return src.replace(/\{\{!--[\s\S]*?--\}\}/g, '').replace(/\{\{!.*?\}\}/g, '');
}

/**
 * Index of the char matching the `(` at `openIdx`, counting only parens (parens are self-balanced
 * independent of any braces/brackets nested inside them, so this is safe even through nested calls).
 * @param {string} text
 * @param {number} openIdx
 */
function findMatchingParen(text, openIdx) {
    let depth = 0;
    for (let i = openIdx; i < text.length; i++) {
        if (text[i] === '(') depth++;
        else if (text[i] === ')') {
            depth--;
            if (depth === 0) return i;
        }
    }
    throw new Error(`unbalanced parens starting at index ${openIdx}`);
}

/**
 * Index of the char matching the `{` at `openIdx` (braces are self-balanced independent of parens).
 * @param {string} text
 * @param {number} openIdx
 */
function findMatchingBrace(text, openIdx) {
    let depth = 0;
    for (let i = openIdx; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') {
            depth--;
            if (depth === 0) return i;
        }
    }
    throw new Error(`unbalanced braces starting at ${openIdx}`);
}

/**
 * @param {string} src
 * @param {string} className
 * @returns {string}
 */
function extractClassBody(src, className) {
    const start = src.indexOf(`export class ${className} extends foundry.abstract.TypeDataModel`);
    assert.notEqual(start, -1, `expected to find class ${className}`);
    const nextClass = src.indexOf('\nexport class ', start + 1);
    return nextClass === -1 ? src.slice(start) : src.slice(start, nextClass);
}

/** @param {string} classBody */
function extractSchemaReturnBlock(classBody) {
    const returnIdx = classBody.indexOf('return {');
    assert.notEqual(returnIdx, -1, 'expected a `return {` inside defineSchema()');
    const braceStart = classBody.indexOf('{', returnIdx);
    const braceEnd = findMatchingBrace(classBody, braceStart);
    return classBody.slice(braceStart + 1, braceEnd);
}

/**
 * Recursively walks a schema object-literal body (the contents of a `defineSchema()` return block,
 * or of a nested `SchemaField({...})`), collecting every dotted field path.
 * @param {string} body
 * @param {string} prefix
 * @param {Set<string>} leafPaths
 * @param {Set<string>} opaquePrefixes
 * @param {{leafPaths: Set<string>, opaquePrefixes: Set<string>}|null} coreStat pre-parsed shape of
 *   the `slaCoreStat(fields)` factory helper, or null while parsing that helper's own body.
 */
function collectFieldPaths(body, prefix, leafPaths, opaquePrefixes, coreStat) {
    const fieldRe = /(\w+):\s*new fields\.(\w+)\(|(\w+):\s*slaCoreStat\(fields\)/g;
    let match;
    while ((match = fieldRe.exec(body))) {
        if (match[2] !== undefined) {
            const name = match[1];
            const fieldType = match[2];
            const path = prefix ? `${prefix}.${name}` : name;
            const openParenIdx = match.index + match[0].length - 1;
            const closeParenIdx = findMatchingParen(body, openParenIdx);
            if (fieldType === 'SchemaField') {
                const braceStart = body.indexOf('{', openParenIdx);
                const braceEnd = findMatchingBrace(body, braceStart);
                collectFieldPaths(body.slice(braceStart + 1, braceEnd), path, leafPaths, opaquePrefixes, coreStat);
            } else {
                leafPaths.add(path);
                if (OPAQUE_FIELD_TYPES.has(fieldType)) opaquePrefixes.add(path);
            }
            fieldRe.lastIndex = closeParenIdx + 1;
        } else {
            const name = match[3];
            const path = prefix ? `${prefix}.${name}` : name;
            assert.ok(coreStat, `slaCoreStat(fields) used before its own shape was parsed (field "${path}")`);
            for (const leaf of coreStat.leafPaths) leafPaths.add(`${path}.${leaf}`);
            for (const opq of coreStat.opaquePrefixes) opaquePrefixes.add(`${path}.${opq}`);
        }
    }
}

/**
 * `module/data/actor.mjs` builds several `stats.*` fields via a `slaCoreStat(fields)` factory
 * (`{ value, bonus }`) instead of an inline `new fields.SchemaField(...)` — parse its shape once so
 * `collectFieldPaths` can expand `str: slaCoreStat(fields)` into `stats.str.value` / `.bonus`.
 * @param {string} actorSrc
 */
function parseCoreStatShape(actorSrc) {
    const sigIdx = actorSrc.indexOf('function slaCoreStat(fields) {');
    assert.notEqual(sigIdx, -1, 'expected to find the slaCoreStat(fields) factory in actor.mjs');
    const fnBraceStart = actorSrc.indexOf('{', sigIdx);
    const fnBraceEnd = findMatchingBrace(actorSrc, fnBraceStart);
    const fnBody = actorSrc.slice(fnBraceStart + 1, fnBraceEnd);

    const schemaFieldMarker = 'new fields.SchemaField(';
    const markerIdx = fnBody.indexOf(schemaFieldMarker);
    assert.notEqual(markerIdx, -1, 'expected slaCoreStat() to return a new fields.SchemaField(...)');
    const openParenIdx = markerIdx + schemaFieldMarker.length - 1;
    const braceStart = fnBody.indexOf('{', openParenIdx);
    const braceEnd = findMatchingBrace(fnBody, braceStart);

    const leafPaths = new Set();
    const opaquePrefixes = new Set();
    collectFieldPaths(fnBody.slice(braceStart + 1, braceEnd), '', leafPaths, opaquePrefixes, null);
    return { leafPaths, opaquePrefixes };
}

/**
 * @param {string} src
 * @param {string} className
 * @param {{leafPaths: Set<string>, opaquePrefixes: Set<string>}} coreStat
 */
function buildSchemaIndex(src, className, coreStat) {
    const schemaBody = extractSchemaReturnBlock(extractClassBody(src, className));
    const leafPaths = new Set();
    const opaquePrefixes = new Set();
    collectFieldPaths(schemaBody, '', leafPaths, opaquePrefixes, coreStat);
    return { leafPaths, opaquePrefixes };
}

/**
 * Parses a simple `export const NAME = { key: ClassName, ... };` object literal (as used by
 * ACTOR_DATA_MODELS / ITEM_DATA_MODELS in module/data/registry.mjs) into a plain `{key: value}` map.
 * @param {string} src
 * @param {string} marker
 */
function parseTypeToClassMap(src, marker) {
    const idx = src.indexOf(marker);
    assert.notEqual(idx, -1, `expected to find "${marker}" in registry.mjs`);
    const braceStart = src.indexOf('{', idx);
    const braceEnd = findMatchingBrace(src, braceStart);
    const body = src.slice(braceStart + 1, braceEnd);
    /** @type {Record<string, string>} */
    const map = {};
    for (const m of body.matchAll(/(\w+):\s*(\w+)/g)) map[m[1]] = m[2];
    return map;
}

/** @param {string} kebab */
function kebabToCamel(kebab) {
    return kebab.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
}

const actorSrc = stripJsComments(readFileSync(join(root, 'module/data/actor.mjs'), 'utf8'));
const itemSrc = stripJsComments(readFileSync(join(root, 'module/data/item.mjs'), 'utf8'));
const registrySrc = stripJsComments(readFileSync(join(root, 'module/data/registry.mjs'), 'utf8'));

const coreStat = parseCoreStatShape(actorSrc);
const actorSchemas = Object.fromEntries(ACTOR_CLASS_NAMES.map((n) => [n, buildSchemaIndex(actorSrc, n, coreStat)]));
const itemSchemas = Object.fromEntries(ITEM_CLASS_NAMES.map((n) => [n, buildSchemaIndex(itemSrc, n, coreStat)]));
const itemTypeToClass = parseTypeToClassMap(registrySrc, 'export const ITEM_DATA_MODELS = {');

/**
 * @param {string} path
 * @param {{leafPaths: Set<string>, opaquePrefixes: Set<string>}[]} candidates
 */
function pathResolves(path, candidates) {
    return candidates.some(({ leafPaths, opaquePrefixes }) => {
        if (leafPaths.has(path)) return true;
        for (const prefix of opaquePrefixes) {
            if (path === prefix || path.startsWith(`${prefix}.`)) return true;
        }
        return false;
    });
}

const ALL_SCHEMAS = [...Object.values(actorSchemas), ...Object.values(itemSchemas)];

/**
 * Determines which schema(s) a template's `system.*` bindings should be checked against, based on
 * its location under templates/. Item type-specific partials (templates/item/parts/item-<type>.hbs)
 * resolve to their exact TypeDataModel, since the type→class mapping is reliable there. Everything
 * else — shared item/actor partials, chat cards, dialogs, and any partial whose folder doesn't
 * actually match what document type it's rendered for (e.g. templates/actor/parts/ebb-drop-zone.hbs
 * is actor-folder but only ever rendered inside an ebbFormula *item* sheet) — is checked against the
 * union of every schema rather than trying to statically follow the Handlebars partial-include
 * graph. That's deliberately loose (a field name reused across types could mask a genuine mismatch),
 * but "matches nothing at all, in any schema" — the bug this test exists to catch — is still caught
 * either way.
 * @param {string} relFile
 */
function candidatesFor(relFile) {
    const itemPartMatch = relFile.match(/^item\/parts\/item-([\w-]+)\.hbs$/);
    if (itemPartMatch) {
        const className = itemTypeToClass[kebabToCamel(itemPartMatch[1])];
        if (className && itemSchemas[className]) return [itemSchemas[className]];
    }
    return ALL_SCHEMAS;
}

const templatesDir = join(root, 'templates');
const hbsFiles = readdirSync(templatesDir, { recursive: true })
    .filter((p) => p.endsWith('.hbs'))
    .map((p) => p.split(sep).join('/'))
    .sort();

// Requires a preceding whitespace char so `data-effect-name="{{eff.name}}"` /
// `data-ammo-name="..."` (whose tail contains the substring `name="`) are never mistaken for a real
// `name=` attribute.
const NAME_ATTR_RE = /(?<=\s)name=(["'])system\.([\w.]+)\1/g;

const bindings = [];
for (const relFile of hbsFiles) {
    const text = stripHandlebarsComments(readFileSync(join(templatesDir, relFile), 'utf8'));
    for (const m of text.matchAll(NAME_ATTR_RE)) {
        const path = m[2];
        // Loop-bound bindings like `system.stats.{{key}}.value` can't be resolved statically.
        if (path.includes('{{')) continue;
        bindings.push({ file: relFile, path });
    }
}

describe('form field name bindings resolve to real schema fields (issue #348 regression guard)', () => {
    test('scan found a plausible number of static system.* bindings', () => {
        // Guards against the scanning regex silently breaking and matching nothing, which would
        // make the assertion below vacuously pass.
        assert.ok(
            bindings.length > 50,
            `expected to find >50 static name="system...." bindings across templates/, found ${bindings.length}`
        );
    });

    test('every static name="system...." binding matches a field declared in defineSchema()', () => {
        const failures = bindings
            .filter(({ file, path }) => !pathResolves(path, candidatesFor(file)))
            .map(({ file, path }) => `${file}: name="system.${path}"`);
        assert.deepEqual(
            failures,
            [],
            `${failures.length} template field(s) reference a schema path that doesn't exist ` +
                `(TypeDataModel silently drops unknown submitted keys — see .docs/LESSONS_LEARNED.md):\n` +
                failures.join('\n')
        );
    });
});
