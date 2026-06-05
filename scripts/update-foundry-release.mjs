#!/usr/bin/env node
/**
 * Notify Foundry's package API about a newly published GitHub release.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const foundryReleaseApi = "https://api.foundryvtt.com/_api/packages/release_version/";

/**
 * @param {string} value
 * @returns {string}
 */
function encodePathSegment(value) {
    return encodeURIComponent(value);
}

/**
 * @param {string} filePath
 * @returns {Record<string, any>}
 */
export function readJsonFile(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

/**
 * @param {Record<string, any>} manifest
 */
function compatibilityFromManifest(manifest) {
    return {
        minimum: manifest.compatibility?.minimum,
        verified: manifest.compatibility?.verified,
        maximum: manifest.compatibility?.maximum
    };
}

/**
 * @param {Record<string, any>} event
 * @param {string} assetName
 * @returns {string | undefined}
 */
function releaseAssetUrl(event, assetName) {
    const asset = event.release?.assets?.find((entry) => entry?.name === assetName);
    return asset?.browser_download_url;
}

/**
 * @param {Record<string, any>} manifest
 * @param {Record<string, any>} event
 * @param {{ dryRun?: boolean, manifestFileName?: string }} [options]
 */
export function buildFoundryReleasePayload(manifest, event, options = {}) {
    const manifestFileName = options.manifestFileName ?? "system.json";
    const repository = event.repository?.full_name;
    const tagName = event.release?.tag_name ?? manifest.version;

    if (!manifest.id) {
        throw new Error("system.json must define an id for the Foundry package release");
    }
    if (!manifest.version) {
        throw new Error("system.json must define a version for the Foundry package release");
    }
    if (!repository) {
        throw new Error("GitHub release event must include repository.full_name");
    }

    const manifestUrl =
        releaseAssetUrl(event, manifestFileName) ??
        `https://github.com/${repository}/releases/download/${encodePathSegment(
            tagName
        )}/${manifestFileName}`;

    return {
        id: manifest.id,
        "dry-run": options.dryRun ?? false,
        release: {
            version: manifest.version,
            manifest: manifestUrl,
            notes:
                event.release?.html_url ??
                `https://github.com/${repository}/releases/tag/${encodePathSegment(tagName)}`,
            compatibility: compatibilityFromManifest(manifest)
        }
    };
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function envFlag(value) {
    return value.toLowerCase() === "true";
}

async function runCli() {
    const token = process.env.FOUNDRY_PACKAGE_RELEASE_TOKEN;
    const eventPath = process.env.GITHUB_EVENT_PATH;
    const dryRun = envFlag(process.env.FOUNDRY_DRY_RUN ?? "false");

    if (!token) {
        throw new Error("FOUNDRY_PACKAGE_RELEASE_TOKEN is required");
    }
    if (!eventPath) {
        throw new Error("GITHUB_EVENT_PATH is required");
    }

    const manifest = readJsonFile(path.join(root, "system.json"));
    const event = readJsonFile(eventPath);
    const payload = buildFoundryReleasePayload(manifest, event, { dryRun });

    const response = await fetch(foundryReleaseApi, {
        headers: {
            "Content-Type": "application/json",
            Authorization: token
        },
        method: "POST",
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(
            `Foundry release update failed (${response.status} ${response.statusText}): ${body}`
        );
    }

    console.log(`Foundry package release updated for ${payload.id} ${payload.release.version}`);
}

const isMain =
    process.argv[1] &&
    path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
    runCli().catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    });
}
