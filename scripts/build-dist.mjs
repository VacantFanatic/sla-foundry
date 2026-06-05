#!/usr/bin/env node
/**
 * Assemble Foundry-installable system files into dist/ (runtime only).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadManifest } from "./validate-dist.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

/** Runtime scripts imported outside module/ (see module/migration.mjs). */
const RUNTIME_SCRIPTS = ["migrate_stat_damage.js"];

/** @type {Array<{ from: string; to?: string }>} */
const STATIC_COPY_DIRS = [
    { from: "module", to: "module" },
    { from: "templates", to: "templates" },
    { from: "lang", to: "lang" },
    { from: "assets", to: "assets" },
    { from: "css", to: "css" }
];

/**
 * @param {string} src
 * @param {string} label
 */
function requirePath(src, label) {
    if (!fs.existsSync(src)) {
        console.error(`Missing ${label}: ${path.relative(root, src)}`);
        process.exit(1);
    }
}

/**
 * @param {string} src
 * @param {string} dest
 * @param {string} label
 */
function copyFile(src, dest, label) {
    requirePath(src, label);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
}

/**
 * @param {string} srcDir
 * @param {string} destDir
 * @param {string} label
 */
function copyDir(srcDir, destDir, label) {
    requirePath(srcDir, label);
    fs.cpSync(srcDir, destDir, { recursive: true });
}

/**
 * @param {import('./validate-dist.mjs').loadManifest extends (...args: any) => infer R ? R : never} manifest
 * @returns {string[]}
 */
function packFileNames(manifest) {
    const names = (manifest.packs ?? []).map((pack) => path.basename(String(pack.path)));
    if (!names.length) {
        console.error("system.json defines no compendium packs to copy.");
        process.exit(1);
    }
    return names;
}

function assembleDist() {
    const manifest = loadManifest(root);
    fs.rmSync(dist, { recursive: true, force: true });
    fs.mkdirSync(dist, { recursive: true });

    for (const spec of STATIC_COPY_DIRS) {
        copyDir(
            path.join(root, spec.from),
            path.join(dist, spec.to ?? spec.from),
            `${spec.from}/ directory`
        );
    }

    const packsSrc = path.join(root, "packs");
    const packsDest = path.join(dist, "packs");
    fs.mkdirSync(packsDest, { recursive: true });
    for (const name of packFileNames(manifest)) {
        copyFile(path.join(packsSrc, name), path.join(packsDest, name), `packs/${name}`);
    }

    const scriptsDest = path.join(dist, "scripts");
    fs.mkdirSync(scriptsDest, { recursive: true });
    for (const name of RUNTIME_SCRIPTS) {
        copyFile(path.join(root, "scripts", name), path.join(scriptsDest, name), `scripts/${name}`);
    }

    copyFile(path.join(root, "system.json"), path.join(dist, "system.json"), "system.json");
    copyFile(path.join(root, "LICENSE.txt"), path.join(dist, "LICENSE.txt"), "LICENSE.txt");
}

const cssOut = path.join(root, "css", "sla-industries.css");
requirePath(cssOut, "css/sla-industries.css (run npm run build:css first)");

assembleDist();
console.log(`Built Foundry system package → ${dist}`);
