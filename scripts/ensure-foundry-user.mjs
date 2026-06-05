#!/usr/bin/env node
/**
 * Ensure FOUNDRY_USER exists on the join page (creates GM user if missing).
 * Uses Gamemaster (default, no password) when the world is already running.
 */
import { chromium } from "@playwright/test";

const base = process.env.FOUNDRY_URL || "http://127.0.0.1:30000";
const targetName = process.env.FOUNDRY_USER;
const targetPassword = process.env.FOUNDRY_PASSWORD ?? "";

if (!targetName) {
    console.error("FOUNDRY_USER is required");
    process.exit(1);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1920, height: 1080 });

await page.goto(`${base}/join`, { waitUntil: "networkidle", timeout: 60_000 });

const labels = await page.locator("select[name='userid'] option").allTextContents();
if (labels.some((l) => l.trim() === targetName)) {
    console.log(`User "${targetName}" already on join page.`);
    await browser.close();
    process.exit(0);
}

if (!labels.some((l) => l.trim() === "Gamemaster")) {
    console.error("Gamemaster user not found; launch sla-test-world first.");
    process.exit(1);
}

console.log(`Creating join user "${targetName}" via Gamemaster session...`);
await page.locator("select[name='userid']").selectOption({ label: "Gamemaster" });
await page.getByRole("textbox", { name: /password/i }).fill("");
await page.getByRole("button", { name: /join game session/i }).click();
await page.waitForURL(/\/game/, { timeout: 90_000 });

await page.waitForFunction(() => globalThis.game?.ready === true, null, { timeout: 90_000 });

const created = await page.evaluate(
    async ({ name, password }) => {
        const existing = game.users.find((u) => u.name === name);
        if (existing) return { ok: true, existed: true };
        const doc = await User.create({
            name,
            role: CONST.USER_ROLES.GAMEMASTER,
            password: password || undefined
        });
        return { ok: Boolean(doc), id: doc?.id };
    },
    { name: targetName, password: targetPassword || null }
);

if (!created.ok) {
    console.error("Failed to create user", created);
    process.exit(1);
}

console.log(created.existed ? "User already existed in world data." : `Created user id=${created.id}`);

await page.evaluate(async () => {
    await game.shutDown();
});
await page.waitForURL(/\/join|\/setup/, { timeout: 60_000 }).catch(() => {});

await browser.close();
console.log("Done.");
