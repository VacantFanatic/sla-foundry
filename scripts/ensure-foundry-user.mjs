#!/usr/bin/env node
/**
 * Ensure FOUNDRY_USER exists on the join page (creates GM user if missing).
 * Uses Gamemaster (default, no password) when the world is already running.
 */
import { existsSync } from 'node:fs';
import { chromium } from '@playwright/test';

// Some Claude Code Remote sandboxes pre-install a Chromium build pinned to a different
// revision than this repo's @playwright/test version expects, so chromium.launch()'s default
// executable-path resolution fails with "Executable doesn't exist". Prefer the pre-installed
// build when present; falls through to Playwright's normal resolution everywhere else
// (Cursor Cloud, CI, a fresh `npx playwright install`).
const PLAYWRIGHT_EXECUTABLE_PATH = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

const base = process.env.FOUNDRY_URL || 'http://127.0.0.1:30000';
const targetName = process.env.FOUNDRY_USER;
const targetPassword = process.env.FOUNDRY_PASSWORD ?? '';
const maxWaitMs = Number(process.env.FOUNDRY_JOIN_WAIT_MS || 300_000);
const pollMs = 5_000;

if (!targetName) {
    console.error('FOUNDRY_USER is required');
    process.exit(1);
}

/**
 * Foundry v14's Join Game form is an autocomplete text input (`input[name="username"]`),
 * not the classic `<select name="userid">` dropdown earlier Foundry versions used — confirmed
 * directly from the served client source (JoinGameForm._prepareContext() in scripts/foundry.mjs
 * sets `context.users = game.users`). Read the live user list straight from the `game` global
 * instead of scraping DOM markup that no longer exists.
 */
async function waitForJoinUsers(page) {
    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
        await page.goto(`${base}/join`, { waitUntil: 'networkidle', timeout: 60_000 });
        const hasForm = await page.locator('input[name="username"]').count();
        if (hasForm) {
            await page.waitForFunction(() => globalThis.game?.users != null, null, { timeout: 15_000 }).catch(() => {});
            const names = await page.evaluate(() =>
                globalThis.game?.users ? Array.from(globalThis.game.users).map((u) => u.name) : []
            );
            if (names.length) {
                return names;
            }
        }
        console.log('Waiting for /join user list...');
        await page.waitForTimeout(pollMs);
    }
    const snippet = await page
        .locator('body')
        .innerText()
        .catch(() => '');
    console.error('/join has no users after waiting.', snippet.slice(0, 300));
    process.exit(1);
}

function pickBootstrapUser(names) {
    if (names.includes('Gamemaster')) return 'Gamemaster';
    return names[0];
}

const browser = await chromium.launch({ headless: true, executablePath: PLAYWRIGHT_EXECUTABLE_PATH });
const page = await browser.newPage();
await page.setViewportSize({ width: 1920, height: 1080 });

const joinUsers = await waitForJoinUsers(page);
if (joinUsers.includes(targetName)) {
    console.log(`User "${targetName}" already on join page.`);
    await browser.close();
    process.exit(0);
}

const bootstrapUser = pickBootstrapUser(joinUsers);
console.log(`Creating join user "${targetName}" via "${bootstrapUser}" session...`);
await page.locator('input[name="username"]').fill(bootstrapUser);
const passwordField = page.locator('input[name="password"]');
if (await passwordField.count()) await passwordField.fill('');
await page.getByRole('button', { name: /join game session/i }).click();
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
    console.error('Failed to create user', created);
    process.exit(1);
}

console.log(created.existed ? 'User already existed in world data.' : `Created user id=${created.id}`);

await browser.close();
console.log('Done.');
