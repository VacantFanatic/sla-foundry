#!/usr/bin/env node
import { chromium } from '@playwright/test';

const FOUNDRY_URL = 'http://127.0.0.1:30000';
const LICENSE_KEY = process.env.FOUNDRY_LICENSE_KEY;
const USER_NAME = process.env.FOUNDRY_USER;
const PASSWORD = process.env.FOUNDRY_PASSWORD;

async function bootstrap() {
  console.log('Starting Foundry VTT first-time setup...');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Step 1: Handle license page
    console.log('Step 1: Checking license page...');
    await page.goto(`${FOUNDRY_URL}/license`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.screenshot({ path: '/tmp/license-page.png', fullPage: true });
    console.log('  Screenshot saved to /tmp/license-page.png');
    
    // Check if we need to submit license key
    const licenseInput = await page.locator('input[name="licenseKey"]').count();
    if (licenseInput > 0) {
      console.log('  Submitting license key...');
      await page.fill('input[name="licenseKey"]', LICENSE_KEY);
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');
      console.log('  License key submitted');
    } else {
      console.log('  Checking for EULA agreement...');
      // Look for EULA checkbox or agreement button
      const eulaCheckbox = page.locator('input[name="eula"]');
      const agreeButton = page.locator('button:has-text("agree"), button:has-text("Accept"), button:has-text("Continue")');
      
      if (await eulaCheckbox.count() > 0) {
        console.log('  Checking EULA checkbox...');
        await eulaCheckbox.check();
      }
      
      if (await agreeButton.count() > 0) {
        console.log('  Clicking agreement button...');
        await agreeButton.first().click();
        await page.waitForLoadState('networkidle');
        console.log('  License accepted');
      } else {
        console.log('  License already accepted');
      }
    }

    // Step 2: Setup page - create world and user
    console.log('Step 2: Navigating to setup page...');
    await page.goto(`${FOUNDRY_URL}/setup`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.screenshot({ path: '/tmp/setup-page.png', fullPage: true });
    console.log('  Screenshot saved to /tmp/setup-page.png');
    
    // Wait a bit for the page to fully render
    await page.waitForTimeout(2000);
    
    // Check if we need to create a world
    console.log('  Checking for existing worlds...');
    const worldsList = await page.locator('#worlds-list li.world, .world-entry').count();
    
    if (worldsList === 0) {
      console.log('  Creating new world...');
      // Try multiple selectors for the create button
      const createSelectors = [
        'button[data-action="createWorld"]',
        'a[data-action="createWorld"]',
        'button:has-text("Create World")',
        '#worlds-list button.create-world',
        '.worlds button.create'
      ];
      
      let createClicked = false;
      for (const selector of createSelectors) {
        if (await page.locator(selector).count() > 0) {
          console.log(`  Found create button: ${selector}`);
          await page.locator(selector).first().click();
          createClicked = true;
          break;
        }
      }
      
      if (!createClicked) {
        throw new Error('Could not find create world button');
      }
      
      await page.waitForSelector('form#world-create, form.world-create, .window-content form', { timeout: 10000 });
      
      // Fill world creation form
      await page.fill('input[name="title"]', 'SLA Industries Test World');
      
      // Wait for system dropdown to be populated
      await page.waitForTimeout(1000);
      await page.selectOption('select[name="system"]', 'sla-industries');
      
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      console.log('  World created');
    } else {
      console.log(`  Found ${worldsList} existing world(s)`);
    }

    // Create user if needed
    console.log('  Checking for users...');
    await page.goto(`${FOUNDRY_URL}/setup`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);
    
    const usersList = await page.locator('#users-list li.user, .user-entry').count();
    
    if (usersList === 0) {
      console.log('  Creating user...');
      // Try multiple selectors for create user button
      const createUserSelectors = [
        'button[data-action="createUser"]',
        'a[data-action="createUser"]',
        'button:has-text("Create User")',
        '#users-list button.create-user',
        '.users button.create'
      ];
      
      let createClicked = false;
      for (const selector of createUserSelectors) {
        if (await page.locator(selector).count() > 0) {
          console.log(`  Found create user button: ${selector}`);
          await page.locator(selector).first().click();
          createClicked = true;
          break;
        }
      }
      
      if (!createClicked) {
        throw new Error('Could not find create user button');
      }
      
      await page.waitForSelector('form#user-create, form.user-create, .window-content form', { timeout: 10000 });
      
      await page.fill('input[name="name"]', USER_NAME);
      if (PASSWORD) {
        await page.fill('input[name="password"]', PASSWORD);
        await page.fill('input[name="passwordConfirm"]', PASSWORD);
      }
      // Try to set role to Gamemaster (value might be "4" or "GAMEMASTER")
      const roleSelect = page.locator('select[name="role"]');
      if (await roleSelect.count() > 0) {
        await roleSelect.selectOption({ index: await roleSelect.locator('option').count() - 1 });
      }
      
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      console.log('  User created');
    } else {
      console.log(`  Found ${usersList} existing user(s)`);
    }

    // Step 3: Launch the world
    console.log('Step 3: Launching world...');
    await page.goto(`${FOUNDRY_URL}/setup`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: '/tmp/setup-before-launch.png', fullPage: true });
    
    // Find and click the launch button for the world
    const launchSelectors = [
      'li.world button[data-action="launchWorld"]',
      'button[data-action="launchWorld"]',
      'button.launch-world',
      'button:has-text("Launch")'
    ];
    
    let launched = false;
    for (const selector of launchSelectors) {
      if (await page.locator(selector).count() > 0) {
        console.log(`  Found launch button: ${selector}`);
        await page.locator(selector).first().click();
        launched = true;
        break;
      }
    }
    
    if (!launched) {
      throw new Error('Could not find launch world button');
    }
    
    console.log('  Waiting for world to launch...');
    await page.waitForURL(/\/(game|join)/, { timeout: 60000 });
    console.log('  World launched successfully');

    // Verify /join is accessible
    console.log('Step 4: Verifying /join endpoint...');
    await page.goto(`${FOUNDRY_URL}/join`, { waitUntil: 'networkidle', timeout: 30000 });
    const joinPage = await page.locator('body').isVisible();
    if (joinPage) {
      console.log('  /join is accessible');
    }

    console.log('\n✓ Foundry VTT setup completed successfully!');
    await browser.close();
    process.exit(0);

  } catch (error) {
    console.error('\n✗ Setup failed:', error.message);
    await page.screenshot({ path: '/tmp/foundry-setup-error.png', fullPage: true });
    console.error('Screenshot saved to /tmp/foundry-setup-error.png');
    await browser.close();
    process.exit(1);
  }
}

bootstrap();
