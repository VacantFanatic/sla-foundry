/**
 * Validates system.json structure expected by Foundry and this repo.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const systemPath = join(__dirname, "../../system.json");

describe("system.json", () => {
    /** @type {Record<string, unknown>} */
    let system;

    test("parses and has required fields", () => {
        system = JSON.parse(readFileSync(systemPath, "utf8"));
        assert.equal(system.id, "sla-industries");
        assert.match(String(system.version), /^\d+\.\d+\.\d+/);
        assert.ok(Array.isArray(system.esmodules));
        assert.ok(system.esmodules.includes("module/sla-industries.mjs"));
        assert.ok(system.compatibility);
        assert.match(String(system.compatibility.minimum), /^\d+/);
        assert.ok(String(system.compatibility.verified).length > 0);
    });

    test("documentTypes lists expected Actor and Item types", () => {
        const dt = system.documentTypes;
        assert.ok(dt.Actor.character);
        assert.ok(dt.Actor.npc);
        assert.ok(dt.Actor.vehicle);
        assert.ok(dt.Item.weapon);
        assert.ok(dt.Item.drug);
        assert.ok(dt.Item.explosive);
    });
});
