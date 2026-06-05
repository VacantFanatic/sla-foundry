#!/usr/bin/env node
/**
 * Assemble Foundry-installable system files into dist/ (runtime only).
 * Mirrors the fvtt-cyberpunk-red-core-dev pattern: dev sources stay in-repo;
 * releases zip dist/, not the full git tree.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

/** @type {Array<{ from: string; to?: string; files?: string[] }>} */
const COPY_SPECS = [
    { from: "module", to: "module" },
    { from: "templates", to: "templates" },
    { from: "lang", to: "lang" },
    { from: "assets", to: "assets" },
    { from: "css", to: "css" },
    { from: "packs", to: "packs", files: ["disciplines.db", "quick-start-gear.db", "skills.db", "species.db", "traits.db", "vehicles.db"] },
    { from: "scripts", to: "scripts", files: ["migrate_stat_damage.js"] },
    { from: "system.json", to: "system.json" },
    { from: "LICENSE.txt", to: "LICENSE.txt" }
];

function rmrf(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

function copyFile(src, dest) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
}

function copyDir(srcDir, destDir) {
    fs.cpSync(srcDir, destDir, { recursive: true });
}

function assembleDist() {
    rmrf(dist);
    fs.mkdirSync(dist, { recursive: true });

    for (const spec of COPY_SPECS) {
        const src = path.join(root, spec.from);
        const dest = path.join(dist, spec.to ?? spec.from);

        if (spec.files) {
            fs.mkdirSync(dest, { recursive: true });
            for (const name of spec.files) {
                copyFile(path.join(src, name), path.join(dest, name));
            }
            continue;
        }

        if (fs.statSync(src).isDirectory()) {
            copyDir(src, dest);
        } else {
            copyFile(src, dest);
        }
    }
}

const cssOut = path.join(root, "css", "sla-industries.css");
if (!fs.existsSync(cssOut)) {
    console.error("Missing css/sla-industries.css — run npm run build:css first.");
    process.exit(1);
}

assembleDist();
console.log(`Built Foundry system package → ${dist}`);
