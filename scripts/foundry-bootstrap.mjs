#!/usr/bin/env node
/**
 * First-boot UI steps: EULA, license key (if needed), launch sla-test-world.
 * World JSON is created on disk by cloud-foundry.sh; user creation is ensure-foundry-user.mjs.
 */
import { chromium } from "@playwright/test";

const FOUNDRY_URL = process.env.FOUNDRY_URL || "http://127.0.0.1:30000";
const LICENSE_KEY = process.env.FOUNDRY_LICENSE_KEY;
const WORLD_ID = process.env.FOUNDRY_WORLD_ID || "sla-test-world";
const JOIN_WAIT_MS = Number(process.env.FOUNDRY_JOIN_WAIT_MS || 300_000);

async function dismissSetupTours(page) {
    for (let i = 0; i < 5; i++) {
        await page.keyboard.press("Escape");
        await page.waitForTimeout(300);
    }
    const close = page.locator(".window-header .header-control.close, button.close");
    if (await close.count()) {
        await close.first().click({ force: true }).catch(() => {});
    }
}

async function acceptLicense(page) {
    await page.goto(`${FOUNDRY_URL}/license`, { waitUntil: "networkidle", timeout: 60_000 });

    const licenseInput = page.locator('input[name="licenseKey"]');
    if (LICENSE_KEY && (await licenseInput.count())) {
        console.log("Submitting license key...");
        await licenseInput.fill(LICENSE_KEY);
        await page.locator('button[type="submit"]').click();
        await page.waitForLoadState("networkidle");
        return;
    }

    const eula = page.locator("#eula-agree, input[name='agree']");
    if (await eula.count()) {
        console.log("Accepting EULA...");
        await eula.check();
        await page.getByRole("button", { name: /^Agree$/i }).click();
        await page.waitForURL(/\/(setup|join|game)/, { timeout: 60_000 }).catch(() => {});
    }
}

async function joinUserNames(page) {
    const labels = await page.locator("select[name='userid'] option").allTextContents();
    return labels.map((l) => l.trim()).filter(Boolean);
}

async function waitForJoinUsers(page) {
    const deadline = Date.now() + JOIN_WAIT_MS;
    while (Date.now() < deadline) {
        await page.goto(`${FOUNDRY_URL}/join`, { waitUntil: "networkidle", timeout: 60_000 });
        const hasHeading = await page.getByRole("heading", { name: /join game session/i }).count();
        if (!hasHeading) {
            await page.waitForTimeout(3000);
            continue;
        }
        const names = await joinUserNames(page);
        if (names.length) {
            console.log(`Join page ready (${names.length} user(s)).`);
            return;
        }
        console.log("Join page visible but no users yet — waiting...");
        await page.waitForTimeout(3000);
    }
    throw new Error("/join did not list any users within the wait window.");
}

async function confirmWorldMigration(page) {
    const migration = page.getByRole("button", { name: /begin migration/i });
    if (!(await migration.count())) return false;
    console.log("Confirming world data migration...");
    await migration.click();

    const backup = page.getByRole("button", { name: /^backup$/i });
    if (await backup.count()) {
        console.log("Creating pre-migration backup...");
        await backup.click();
    }

    await page.waitForURL(/\/(game|join)/, { timeout: 300_000 });
    return true;
}

async function launchFromSetup(page) {
    await page.goto(`${FOUNDRY_URL}/setup`, { waitUntil: "networkidle", timeout: 60_000 });
    await page.waitForTimeout(2000);

    if (page.url().includes("/join")) {
        console.log("/setup redirected to /join — world may already be running.");
        return waitForJoinUsers(page);
    }

    await dismissSetupTours(page);

    const worldCards = page.locator("li.world");
    const count = await worldCards.count();
    if (count === 0) {
        throw new Error(`No worlds on setup page (expected ${WORLD_ID} from ensure_world_json).`);
    }
    console.log(`Found ${count} world(s) on setup page.`);

    const target = page.locator(`li.world[data-world-id="${WORLD_ID}"], li.world`).first();
    await target.click();
    await page.waitForTimeout(500);

    const launch = page.locator('[data-action="worldLaunch"]');
    if (!(await launch.count())) {
        throw new Error("Could not find [data-action=worldLaunch] on setup page.");
    }
    console.log("Launching world...");
    await launch.first().click();

    if (await confirmWorldMigration(page)) {
        return waitForJoinUsers(page);
    }

    await page.waitForURL(/\/(game|join)/, { timeout: 120_000 });
    return waitForJoinUsers(page);
}

async function bootstrap() {
    console.log("Starting Foundry first-boot bootstrap...");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1920, height: 1080 });

    try {
        await acceptLicense(page);
        await launchFromSetup(page);
        console.log("Foundry first-boot bootstrap complete.");
        await browser.close();
        process.exit(0);
    } catch (error) {
        console.error("First-boot bootstrap failed:", error.message);
        await page.screenshot({ path: "/tmp/foundry-setup-error.png", fullPage: true }).catch(() => {});
        console.error("Screenshot: /tmp/foundry-setup-error.png");
        await browser.close();
        process.exit(1);
    }
}

bootstrap();
