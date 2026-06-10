#!/usr/bin/env node
import fs from "node:fs";
import packageJson from "../package.json" with { type: "json" };

const REPO = "https://github.com/VacantFanatic/sla-foundry";
const version = packageJson.version;

// Update system.json version and download URL
const manifest = JSON.parse(fs.readFileSync("system.json", "utf8"));
manifest.version = version;
manifest.download = `${REPO}/releases/download/${version}/sla-industries.zip`;
fs.writeFileSync("system.json", JSON.stringify(manifest, null, 4) + "\n");

// Promote [Unreleased] to the new version in CHANGELOG.md
const changelogPath = "CHANGELOG.md";
const changelog = fs.readFileSync(changelogPath, "utf8");

const UNRELEASED_HEADER = "## [Unreleased]";
const headerIndex = changelog.indexOf(UNRELEASED_HEADER);
if (headerIndex === -1) {
    console.error("ERROR: No [Unreleased] section found in CHANGELOG.md");
    process.exit(1);
}

const afterHeader = changelog.slice(headerIndex + UNRELEASED_HEADER.length);
const nextSectionMatch = afterHeader.match(/\n## \[/);
const unreleasedContent = (
    nextSectionMatch ? afterHeader.slice(0, nextSectionMatch.index) : afterHeader
).trim();

if (!unreleasedContent) {
    console.error(
        "ERROR: [Unreleased] section in CHANGELOG.md is empty.\n" +
            "Add entries under ## [Unreleased] before running npm version."
    );
    process.exit(1);
}

const today = new Date().toISOString().split("T")[0];

// Insert a new versioned header after [Unreleased]
let newChangelog = changelog.replace(
    UNRELEASED_HEADER + "\n",
    `${UNRELEASED_HEADER}\n\n## [${version}] - ${today}\n`
);

// Update the [Unreleased] reference link and insert the new version link beneath it
const unreleasedLinkRegex = /^\[Unreleased\]:.+$/m;
const newUnreleasedLink = `[Unreleased]: ${REPO}/compare/${version}...HEAD`;
const newVersionLink = `[${version}]: ${REPO}/releases/tag/${version}`;

if (unreleasedLinkRegex.test(newChangelog)) {
    newChangelog = newChangelog.replace(
        unreleasedLinkRegex,
        `${newUnreleasedLink}\n${newVersionLink}`
    );
} else {
    newChangelog = newChangelog.trimEnd() + `\n\n${newUnreleasedLink}\n${newVersionLink}\n`;
}

fs.writeFileSync(changelogPath, newChangelog);
