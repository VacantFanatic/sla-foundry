#!/usr/bin/env node
/**
 * Validate dist/ (and optionally sla-industries.zip) against system.json manifest paths.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(root, "dist");
const zipPath = path.join(root, "sla-industries.zip");
const systemId = "sla-industries";

/**
 * @param {string} [rootDir]
 */
export function loadManifest(rootDir = root) {
    const manifestPath = path.join(rootDir, "system.json");
    if (!fs.existsSync(manifestPath)) {
        throw new Error(`Missing system.json at ${manifestPath}`);
    }
    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

/**
 * @param {Record<string, unknown>} manifest
 * @returns {string[]}
 */
export function manifestAssetPaths(manifest) {
    /** @type {string[]} */
    const paths = [];

    for (const entry of manifest.esmodules ?? []) {
        paths.push(String(entry));
    }
    for (const entry of manifest.styles ?? []) {
        paths.push(String(entry));
    }
    for (const entry of manifest.languages ?? []) {
        if (entry?.path) paths.push(String(entry.path));
    }
    for (const pack of manifest.packs ?? []) {
        if (pack?.path) paths.push(String(pack.path));
    }

    paths.push("system.json");
    paths.push("scripts/migrate_stat_damage.js");

    return [...new Set(paths)];
}

/**
 * @param {string} baseDir
 * @param {Record<string, unknown>} manifest
 */
export function validateDist(baseDir, manifest) {
    if (!fs.existsSync(baseDir)) {
        throw new Error(`dist directory not found: ${baseDir}`);
    }

    const distManifestPath = path.join(baseDir, "system.json");
    if (!fs.existsSync(distManifestPath)) {
        throw new Error("dist/system.json not found — run npm run build");
    }

    const distManifest = JSON.parse(fs.readFileSync(distManifestPath, "utf8"));
    if (distManifest.id !== manifest.id) {
        throw new Error(`dist system id mismatch: ${distManifest.id} !== ${manifest.id}`);
    }
    if (distManifest.version !== manifest.version) {
        throw new Error(
            `dist version mismatch: ${distManifest.version} !== ${manifest.version}`
        );
    }

    const missing = [];
    for (const rel of manifestAssetPaths(manifest)) {
        const full = path.join(baseDir, rel);
        if (!fs.existsSync(full)) {
            missing.push(rel);
        }
    }

    if (missing.length) {
        throw new Error(`dist is missing manifest paths:\n  - ${missing.join("\n  - ")}`);
    }

    return { ok: true, pathCount: manifestAssetPaths(manifest).length };
}

/**
 * @param {string} zipFile
 */
export function validateZip(zipFile = zipPath) {
    if (!fs.existsSync(zipFile)) {
        throw new Error(`zip not found: ${zipFile} — run npm run package`);
    }

    let listing;
    try {
        listing = execSync(`unzip -Z1 ${JSON.stringify(zipFile)}`, { encoding: "utf8" });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`failed to list zip: ${message}`);
    }

    const entries = listing.trim().split("\n").filter(Boolean);
    const prefix = `${systemId}/`;
    const hasRootFolder = entries.some((e) => e.startsWith(prefix));
    if (!hasRootFolder) {
        throw new Error(`zip must contain top-level folder "${systemId}/"`);
    }

    const required = `${prefix}system.json`;
    if (!entries.includes(required)) {
        throw new Error(`zip missing ${required}`);
    }

    const devPatterns = [
        /^sla-industries\/tests\//,
        /^sla-industries\/src\//,
        /^sla-industries\/package\.json$/,
        /^sla-industries\/playwright\.config\.js$/,
        /^sla-industries\/\.github\//
    ];
    const leaked = entries.filter((e) => devPatterns.some((re) => re.test(e)));
    if (leaked.length) {
        throw new Error(`zip contains dev artifacts:\n  - ${leaked.join("\n  - ")}`);
    }

    return { ok: true, entryCount: entries.length };
}

/**
 * @param {string} rootDir
 */
export function assertVersionSync(rootDir = root) {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
    const manifest = loadManifest(rootDir);
    if (pkg.version !== manifest.version) {
        throw new Error(
            `version mismatch: package.json=${pkg.version}, system.json=${manifest.version}`
        );
    }
}

function runCli() {
    const syncOnly = process.argv.includes("--sync-only");
    const checkZip = process.argv.includes("--zip");

    assertVersionSync(root);
    if (syncOnly) {
        console.log("version sync OK");
        return;
    }

    const manifest = loadManifest(root);
    const distResult = validateDist(distDir, manifest);
    console.log(`dist OK (${distResult.pathCount} manifest paths)`);

    if (checkZip) {
        const zipResult = validateZip();
        console.log(`zip OK (${zipResult.entryCount} entries)`);
    }
}

const isMain =
    process.argv[1] &&
    path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
    runCli();
}
